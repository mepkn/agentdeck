// Package sessions runs agent CLIs in PTYs. The PTY is the session: the
// terminal view shows its output as is, the chat view is built from the
// agent's session log, and the screen is read for menus and status.
package sessions

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/screen"
	"github.com/mepkn/agentdeck/desktop/internal/store"
)

const (
	StatusAsleep   = "asleep"
	StatusStarting = "starting"
	StatusWorking  = "working"
	StatusWaiting  = "waiting"
	StatusIdle     = "idle"
)

// Info is a session as the UI sees it.
type Info struct {
	store.Session
	Status string         `json:"status"`
	Prompt *screen.Prompt `json:"prompt"`
	Unread bool           `json:"unread"`
}

type ItemsEvent struct {
	ID    string        `json:"id"`
	Items []agents.Item `json:"items"`
}

type OutputEvent struct {
	ID    string `json:"id"`
	Start int64  `json:"start"`
	Data  []byte `json:"data"` // base64 in JSON
}

type Snapshot struct {
	Data []byte `json:"data"`
	End  int64  `json:"end"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

// Events receives everything the UI shows live.
type Events interface {
	SessionChanged(Info)
	SessionRemoved(id string)
	Items(ItemsEvent)
	Output(OutputEvent)
}

type live struct {
	s       store.Session
	adapter agents.Adapter
	dir     string
	run     *run
	status  string
	prompt  *screen.Prompt
	unread  bool

	parser  agents.Parser
	items   []agents.Item
	index   map[string]int
	offset  int64
	partial []byte
	saved   time.Time
}

type Manager struct {
	mu     sync.Mutex
	st     *store.Store
	ev     Events
	live   map[string]*live
	focus  string
	closed bool
}

func New(st *store.Store, ev Events) *Manager {
	m := &Manager{st: st, ev: ev, live: map[string]*live{}}
	for _, s := range st.Sessions() {
		a, ok := agents.Get(s.Agent)
		p, pok := st.Project(s.ProjectID)
		if !ok || !pok {
			continue
		}
		m.live[s.ID] = &live{s: s, adapter: a, dir: p.Path, status: StatusAsleep}
	}
	return m
}

func (l *live) info() Info {
	return Info{Session: l.s, Status: l.status, Prompt: l.prompt, Unread: l.unread}
}

func (m *Manager) List() []Info {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Info, 0, len(m.live))
	for _, l := range m.live {
		out = append(out, l.info())
	}
	return out
}

func (m *Manager) get(id string) (*live, error) {
	l, ok := m.live[id]
	if !ok {
		return nil, errors.New("session not found")
	}
	return l, nil
}

func (m *Manager) Start(projectID, agentID string) (Info, error) {
	a, ok := agents.Get(agentID)
	if !ok {
		return Info{}, errors.New("unknown agent")
	}
	p, ok := m.st.Project(projectID)
	if !ok {
		return Info{}, errors.New("project not found")
	}
	now := time.Now().UnixMilli()
	s := store.Session{
		ID: uuid.NewString(), ProjectID: projectID, Agent: agentID,
		AgentSessionID: a.NewSessionID(), CreatedAt: now, UpdatedAt: now,
	}
	if err := m.st.PutSession(s); err != nil {
		return Info{}, err
	}
	l := &live{s: s, adapter: a, dir: p.Path, status: StatusAsleep}
	m.mu.Lock()
	m.live[s.ID] = l
	err := m.spawn(l, false)
	info := l.info()
	m.mu.Unlock()
	m.ev.SessionChanged(info)
	return info, err
}

func (m *Manager) Wake(id string) error {
	m.mu.Lock()
	l, err := m.get(id)
	if err == nil && l.run == nil {
		// A session that never got a message has no log to resume from.
		_, statErr := os.Stat(l.logPath())
		err = m.spawn(l, statErr == nil)
	}
	var info Info
	if l != nil {
		info = l.info()
	}
	m.mu.Unlock()
	if err == nil {
		m.ev.SessionChanged(info)
	}
	return err
}

// spawn starts the CLI; callers hold mu.
func (m *Manager) spawn(l *live, resume bool) error {
	if m.closed {
		return errors.New("shutting down")
	}
	r, err := startRun(l.adapter.Binary(), l.adapter.Args(agents.Launch{
		Dir: l.dir, AgentSessionID: l.s.AgentSessionID, Resume: resume,
	}), l.dir)
	if err != nil {
		return err
	}
	l.run = r
	l.status = StatusStarting
	l.prompt = nil
	r.onOutput = func(start int64, data []byte) {
		m.ev.Output(OutputEvent{ID: l.s.ID, Start: start, Data: data})
	}
	go r.readLoop()
	go m.watch(l, r)
	return nil
}

// watch polls the session log and the screen while the CLI runs.
func (m *Manager) watch(l *live, r *run) {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-r.done:
			m.mu.Lock()
			items := l.refresh()
			m.titleFrom(items, l)
			if l.run == r {
				l.run = nil
				l.status = StatusAsleep
				l.prompt = nil
			}
			info := l.info()
			m.saveLocked(l, true)
			m.mu.Unlock()
			m.emitItems(l.s.ID, items)
			m.ev.SessionChanged(info)
			return
		case <-t.C:
			lines, dirty := r.screen()
			m.mu.Lock()
			items := l.refresh()
			changed := m.titleFrom(items, l)
			if dirty || l.status == StatusStarting {
				changed = m.applyScreen(l, screen.Read(lines)) || changed
			}
			info := l.info()
			m.mu.Unlock()
			m.emitItems(l.s.ID, items)
			if changed {
				m.ev.SessionChanged(info)
			}
		}
	}
}

func (m *Manager) applyScreen(l *live, s screen.State) bool {
	status := StatusIdle
	switch {
	case s.Prompt != nil:
		status = StatusWaiting
	case s.Working:
		status = StatusWorking
	case l.status == StatusStarting && len(l.items) == 0 && l.run != nil && time.Since(l.run.started) < 3*time.Second:
		status = StatusStarting
	}
	changed := status != l.status || !samePrompt(s.Prompt, l.prompt)
	if status != l.status && m.focus != l.s.ID &&
		(status == StatusWaiting || (status == StatusIdle && l.status == StatusWorking)) {
		l.unread = true
	}
	l.status, l.prompt = status, s.Prompt
	return changed
}

func samePrompt(a, b *screen.Prompt) bool {
	if a == nil || b == nil {
		return a == b
	}
	if a.Question != b.Question || a.Selected != b.Selected || len(a.Options) != len(b.Options) {
		return false
	}
	for i := range a.Options {
		if a.Options[i] != b.Options[i] {
			return false
		}
	}
	return true
}

// titleFrom names the session after its first message.
func (m *Manager) titleFrom(items []agents.Item, l *live) bool {
	if len(items) > 0 {
		l.s.UpdatedAt = time.Now().UnixMilli()
	}
	if l.s.Title == "" {
		for _, it := range items {
			if it.Kind == "user" {
				t := strings.Join(strings.Fields(it.Text), " ")
				if r := []rune(t); len(r) > 60 {
					t = string(r[:59]) + "…"
				}
				l.s.Title = t
				m.saveLocked(l, true)
				return true
			}
		}
	}
	if len(items) > 0 {
		m.saveLocked(l, false)
	}
	return false
}

// saveLocked persists the session, at most every 10s unless forced.
func (m *Manager) saveLocked(l *live, force bool) {
	if !force && time.Since(l.saved) < 10*time.Second {
		return
	}
	l.saved = time.Now()
	_ = m.st.PutSession(l.s)
}

func (m *Manager) emitItems(id string, items []agents.Item) {
	if len(items) > 0 {
		m.ev.Items(ItemsEvent{ID: id, Items: items})
	}
}

func (l *live) logPath() string { return l.adapter.LogPath(l.dir, l.s.AgentSessionID) }

// refresh reads new lines of the session log; callers hold mu. It returns
// the items that were added or changed.
func (l *live) refresh() []agents.Item {
	path := l.logPath()
	if path == "" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return nil
	}
	if l.parser == nil || fi.Size() < l.offset {
		l.parser, l.items, l.index, l.offset, l.partial = l.adapter.NewParser(), nil, map[string]int{}, 0, nil
	}
	if fi.Size() == l.offset {
		return nil
	}
	buf := make([]byte, fi.Size()-l.offset)
	n, _ := f.ReadAt(buf, l.offset)
	l.offset += int64(n)
	data := append(l.partial, buf[:n]...)
	var changed []agents.Item
	for {
		i := indexByte(data, '\n')
		if i < 0 {
			break
		}
		for _, it := range l.parser.Feed(data[:i]) {
			if j, ok := l.index[it.ID]; ok {
				l.items[j] = it
			} else {
				l.index[it.ID] = len(l.items)
				l.items = append(l.items, it)
			}
			changed = append(changed, it)
		}
		data = data[i+1:]
	}
	l.partial = append([]byte(nil), data...)
	return changed
}

func indexByte(b []byte, c byte) int {
	for i, x := range b {
		if x == c {
			return i
		}
	}
	return -1
}

// Items returns the whole chat. New lines it reads are sent as events too,
// so the watcher, which would have sent them, misses nothing.
func (m *Manager) Items(id string) ([]agents.Item, error) {
	m.mu.Lock()
	l, err := m.get(id)
	if err != nil {
		m.mu.Unlock()
		return nil, err
	}
	items := l.refresh()
	changed := m.titleFrom(items, l)
	all := append([]agents.Item{}, l.items...)
	info := l.info()
	m.mu.Unlock()
	m.emitItems(id, items)
	if changed {
		m.ev.SessionChanged(info)
	}
	return all, nil
}

// Focus marks the session the user is looking at ("" for none) as read.
func (m *Manager) Focus(id string) {
	m.mu.Lock()
	m.focus = id
	l, ok := m.live[id]
	changed := ok && l.unread
	var info Info
	if changed {
		l.unread = false
		info = l.info()
	}
	m.mu.Unlock()
	if changed {
		m.ev.SessionChanged(info)
	}
}

func (m *Manager) running(id string) (*run, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, err := m.get(id)
	if err != nil {
		return nil, err
	}
	if l.run == nil {
		return nil, errors.New("session is asleep")
	}
	return l.run, nil
}

// Send types a message into the agent's input and submits it.
func (m *Manager) Send(id, text string) error {
	r, err := m.running(id)
	if err != nil {
		return err
	}
	text = strings.TrimRight(text, "\n")
	if strings.Contains(text, "\n") {
		text = "\x1b[200~" + text + "\x1b[201~"
	}
	if err := r.write(text); err != nil {
		return err
	}
	// The CLIs treat Enter in the same read as the text as part of a paste.
	time.Sleep(80 * time.Millisecond)
	return r.write("\r")
}

var keys = map[string]string{
	"esc": "\x1b", "enter": "\r", "up": "\x1b[A", "down": "\x1b[B",
	"tab": "\t", "shift-tab": "\x1b[Z", "ctrl-c": "\x03",
}

func (m *Manager) Key(id, key string) error {
	seq, ok := keys[key]
	if !ok {
		return errors.New("unknown key")
	}
	r, err := m.running(id)
	if err != nil {
		return err
	}
	return r.write(seq)
}

// Answer picks a menu option by moving the cursor to it and pressing Enter.
func (m *Manager) Answer(id string, option int) error {
	m.mu.Lock()
	l, err := m.get(id)
	var p *screen.Prompt
	var r *run
	if err == nil {
		p, r = l.prompt, l.run
	}
	m.mu.Unlock()
	if err != nil {
		return err
	}
	if p == nil || r == nil {
		return errors.New("no question to answer")
	}
	move := "\x1b[B"
	d := option - p.Selected
	if d < 0 {
		move, d = "\x1b[A", -d
	}
	return r.write(strings.Repeat(move, d) + "\r")
}

func (m *Manager) Input(id, data string) error {
	r, err := m.running(id)
	if err != nil {
		return err
	}
	return r.write(data)
}

func (m *Manager) Resize(id string, cols, rows int) error {
	r, err := m.running(id)
	if err != nil {
		return err
	}
	return r.resize(cols, rows)
}

func (m *Manager) Snapshot(id string) (Snapshot, error) {
	r, err := m.running(id)
	if err != nil {
		return Snapshot{}, err
	}
	return r.snapshot(), nil
}

// Sleep stops the CLI; the session stays and can be woken.
func (m *Manager) Sleep(id string) error {
	r, err := m.running(id)
	if err != nil {
		return err
	}
	r.stop()
	return nil
}

// Close stops the CLI and removes the session from the app. The agent's own
// session log stays where it is.
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	l, err := m.get(id)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	r := l.run
	delete(m.live, id)
	m.mu.Unlock()
	if r != nil {
		r.stop()
	}
	if err := m.st.RemoveSession(id); err != nil {
		return err
	}
	m.ev.SessionRemoved(id)
	return nil
}

// RemoveProject closes the project's sessions and forgets the project.
func (m *Manager) RemoveProject(projectID string) error {
	m.mu.Lock()
	var ids []string
	for id, l := range m.live {
		if l.s.ProjectID == projectID {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.Close(id)
	}
	return m.st.RemoveProject(projectID)
}

func (m *Manager) AddProject(path string) (store.Project, error) {
	path = filepath.Clean(path)
	if fi, err := os.Stat(path); err != nil || !fi.IsDir() {
		return store.Project{}, errors.New("not a folder")
	}
	for _, p := range m.st.Projects() {
		if p.Path == path {
			return p, nil
		}
	}
	p := store.Project{ID: uuid.NewString(), Name: filepath.Base(path), Path: path}
	return p, m.st.AddProject(p)
}

// Waiting counts sessions waiting for an answer, for the tray.
func (m *Manager) Waiting() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, l := range m.live {
		if l.status == StatusWaiting {
			n++
		}
	}
	return n
}

// Shutdown stops every CLI; sessions are resumed on the next start.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	m.closed = true
	var runs []*run
	for _, l := range m.live {
		if l.run != nil {
			runs = append(runs, l.run)
		}
		m.saveLocked(l, true)
	}
	m.mu.Unlock()
	var wg sync.WaitGroup
	for _, r := range runs {
		wg.Add(1)
		go func() { defer wg.Done(); r.stop() }()
	}
	wg.Wait()
}
