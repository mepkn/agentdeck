//go:build smoke

// Runs a real agent CLI end to end (it sends one short message, so it uses
// the agent's account): AGENT=claude go test -tags smoke -run Smoke -v ./internal/sessions/
package sessions

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/shellenv"
	"github.com/mepkn/agentdeck/desktop/internal/store"
)

type recorder struct {
	mu    sync.Mutex
	last  Info
	items []agents.Item
}

func (r *recorder) SessionChanged(i Info) { r.mu.Lock(); r.last = i; r.mu.Unlock() }
func (r *recorder) SessionRemoved(string) {}
func (r *recorder) Items(e ItemsEvent)    { r.mu.Lock(); r.items = append(r.items, e.Items...); r.mu.Unlock() }
func (r *recorder) Output(OutputEvent)    {}

func (r *recorder) info() Info { r.mu.Lock(); defer r.mu.Unlock(); return r.last }

func waitFor(t *testing.T, what string, d time.Duration, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestSmoke(t *testing.T) {
	shellenv.Load()
	agent := os.Getenv("AGENT")
	if agent == "" {
		agent = "claude"
	}
	dir := t.TempDir()
	dir, _ = filepath.EvalSymlinks(dir)
	st, err := store.Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	rec := &recorder{}
	m := New(st, rec)
	t.Cleanup(m.Shutdown)
	p, err := m.AddProject(dir)
	if err != nil {
		t.Fatal(err)
	}
	s, err := m.Start(p.ID, agent)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		if t.Failed() {
			m.mu.Lock()
			r := m.live[s.ID].run
			m.mu.Unlock()
			if r != nil {
				lines, _ := r.screen()
				t.Logf("status %s, screen:\n%s", rec.info().Status, strings.Join(lines, "\n"))
			}
		}
	})

	// A new folder may first ask whether to trust it.
	waitFor(t, "the agent to be ready", 30*time.Second, func() bool {
		i := rec.info()
		if i.Status == StatusWaiting && i.Prompt != nil {
			t.Logf("menu: %q %v (selected %d)", i.Prompt.Question, i.Prompt.Options, i.Prompt.Selected)
			n := 1
			for _, o := range i.Prompt.Options {
				if strings.HasPrefix(o.Label, "Yes") {
					n = o.Number
					break
				}
			}
			if err := m.Answer(s.ID, n); err != nil {
				t.Fatal(err)
			}
			time.Sleep(1500 * time.Millisecond)
			return false
		}
		return i.Status == StatusIdle
	})
	if err := m.Send(s.ID, "Reply with just: OK"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "a reply in the session log", 90*time.Second, func() bool {
		items, _ := m.Items(s.ID)
		for _, it := range items {
			if it.Kind == "assistant" && strings.Contains(it.Text, "OK") {
				return true
			}
		}
		return false
	})
	items, _ := m.Items(s.ID)
	for _, it := range items {
		t.Logf("%s: %q", it.Kind, it.Text)
	}
	waitFor(t, "the title", 5*time.Second, func() bool { return rec.info().Title != "" })
	if err := m.Sleep(s.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "asleep", 10*time.Second, func() bool { return rec.info().Status == StatusAsleep })
	if err := m.Wake(s.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "woken and idle", 30*time.Second, func() bool { return rec.info().Status == StatusIdle })
	t.Logf("final: %+v", rec.info())
}
