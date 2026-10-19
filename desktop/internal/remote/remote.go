// Package remote links the Mac to paired phones through the relay. Every
// message is end-to-end encrypted (see crypto.go); the relay only forwards.
package remote

import (
	"context"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/sessions"
	"github.com/mepkn/agentdeck/desktop/internal/store"
)

const (
	DefaultRelay = "wss://agentdeck.pknspace.com/relay"
	pairingTTL   = 5 * time.Minute
	// Messages older than this, or seen before, are dropped.
	maxAge = 10 * time.Minute
	// The phone gets the last part of a long chat.
	maxItems = 300
)

// Deck is what phones can do; DeckService implements it.
type Deck interface {
	Projects() []store.Project
	Agents() []agents.Info
	Sessions() []sessions.Info
	Items(id string) ([]agents.Item, error)
	Start(projectID, agent string) (sessions.Info, error)
	Send(id, text string) error
	Key(id, key string) error
	Answer(id string, n int) error
	Wake(id string) error
	Sleep(id string) error
	Close(id string) error
}

type Phone struct {
	ID        string `json:"id"`  // relay ID (Ed25519 public key)
	Box       string `json:"box"` // X25519 public key
	Name      string `json:"name"`
	PushToken string `json:"pushToken,omitempty"`
	AddedAt   int64  `json:"addedAt"`
}

type saved struct {
	Sign   string  `json:"sign"` // Ed25519 seed
	Box    string  `json:"box"`  // X25519 private key
	Phones []Phone `json:"phones"`
}

// Status is what the pairing dialog shows.
type Status struct {
	Relay     string        `json:"relay"`
	Connected bool          `json:"connected"`
	Pairing   bool          `json:"pairing"`
	Phones    []PhoneStatus `json:"phones"`
}

type PhoneStatus struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Online  bool   `json:"online"`
	AddedAt int64  `json:"addedAt"`
}

// Pairing is the QR code's content: everything a phone needs to reach and
// trust this Mac.
type Pairing struct {
	Relay  string `json:"r"`
	ID     string `json:"i"`
	Box    string `json:"k"`
	Secret string `json:"s"`
	Name   string `json:"n"`
}

type Remote struct {
	deck     Deck
	path     string
	relay    string
	name     string
	onChange func(Status)
	push     func(token, title, body, sessionID string)

	mu        sync.Mutex
	s         saved
	sign      ed25519.PrivateKey
	box       *ecdh.PrivateKey
	id        string
	client    *client
	cancel    context.CancelFunc
	connected bool
	pairing   *Pairing
	expires   time.Time
	online    map[string]bool
	open      map[string]string // phone → session it has open
	seen      map[string]time.Time
	status    map[string]string // session → last status, for push
}

// New loads (or creates) this Mac's keys and paired phones from path.
func New(path, relay, name string, deck Deck, onChange func(Status)) (*Remote, error) {
	r := &Remote{
		deck: deck, path: path, relay: relay, name: name, onChange: onChange, push: expoPush,
		online: map[string]bool{}, open: map[string]string{}, seen: map[string]time.Time{}, status: map[string]string{},
	}
	b, err := os.ReadFile(path)
	if err == nil {
		err = json.Unmarshal(b, &r.s)
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if r.s.Sign == "" {
		seed := make([]byte, ed25519.SeedSize)
		rand.Read(seed)
		box, _ := ecdh.X25519().GenerateKey(rand.Reader)
		r.s.Sign, r.s.Box = b64(seed), b64(box.Bytes())
		if err := r.saveLocked(); err != nil {
			return nil, err
		}
	}
	seed, err := unb64(r.s.Sign)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, errors.New("remote: bad key file")
	}
	r.sign = ed25519.NewKeyFromSeed(seed)
	r.id = b64(r.sign.Public().(ed25519.PublicKey))
	bk, err := unb64(r.s.Box)
	if err != nil {
		return nil, err
	}
	if r.box, err = ecdh.X25519().NewPrivateKey(bk); err != nil {
		return nil, err
	}
	for _, s := range deck.Sessions() {
		r.status[s.ID] = s.Status
	}
	r.mu.Lock()
	r.reconcileLocked()
	r.mu.Unlock()
	return r, nil
}

func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "agentdeck", "remote.json"), nil
}

func (r *Remote) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(r.path), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(r.s, "", "  ")
	tmp := r.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, r.path)
}

// reconcileLocked connects to the relay only while there is a phone or a
// pairing in progress.
func (r *Remote) reconcileLocked() {
	want := len(r.s.Phones) > 0 || r.pairing != nil
	if want && r.client == nil {
		ctx, cancel := context.WithCancel(context.Background())
		r.cancel = cancel
		r.client = &client{url: r.relay, key: r.sign, id: r.id, onFrame: r.handle, onConnected: r.setConnected}
		go r.client.run(ctx)
	} else if !want && r.client != nil {
		r.cancel()
		r.client, r.cancel, r.connected = nil, nil, false
	}
}

func (r *Remote) setConnected(ok bool) {
	r.mu.Lock()
	r.connected = ok
	c := r.client
	var ids []string
	for _, p := range r.s.Phones {
		ids = append(ids, p.ID)
	}
	if !ok {
		r.online = map[string]bool{}
	}
	r.mu.Unlock()
	if ok && c != nil {
		c.write(frame{T: "watch", IDs: ids})
	}
	r.changed()
}

func (r *Remote) changed() {
	if r.onChange != nil {
		r.onChange(r.Status())
	}
}

func (r *Remote) Status() Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	st := Status{Relay: r.relay, Connected: r.connected, Pairing: r.pairing != nil, Phones: []PhoneStatus{}}
	for _, p := range r.s.Phones {
		st.Phones = append(st.Phones, PhoneStatus{ID: p.ID, Name: p.Name, Online: r.online[p.ID], AddedAt: p.AddedAt})
	}
	return st
}

// StartPairing returns what the QR code holds. It is valid for five minutes
// and for one phone.
func (r *Remote) StartPairing() Pairing {
	secret := make([]byte, 16)
	rand.Read(secret)
	r.mu.Lock()
	r.pairing = &Pairing{Relay: r.relay, ID: r.id, Box: b64(r.box.PublicKey().Bytes()), Secret: b64(secret), Name: r.name}
	r.expires = time.Now().Add(pairingTTL)
	cur := r.pairing
	p := *cur
	r.reconcileLocked()
	r.mu.Unlock()
	r.changed()
	time.AfterFunc(pairingTTL, func() {
		r.mu.Lock()
		expired := r.pairing == cur
		r.mu.Unlock()
		if expired {
			r.StopPairing()
		}
	})
	return p
}

func (r *Remote) StopPairing() {
	r.mu.Lock()
	r.pairing = nil
	r.reconcileLocked()
	r.mu.Unlock()
	r.changed()
}

func (r *Remote) RemovePhone(id string) error {
	r.mu.Lock()
	phones := r.s.Phones[:0]
	for _, p := range r.s.Phones {
		if p.ID != id {
			phones = append(phones, p)
		}
	}
	r.s.Phones = phones
	delete(r.online, id)
	delete(r.open, id)
	err := r.saveLocked()
	r.reconcileLocked()
	r.mu.Unlock()
	r.changed()
	return err
}

func (r *Remote) Shutdown() {
	r.mu.Lock()
	if r.cancel != nil {
		r.cancel()
	}
	r.mu.Unlock()
}

// request is everything a phone can ask. Op says which fields apply.
type request struct {
	Rid       int    `json:"rid"`
	Ts        int64  `json:"ts"`
	Op        string `json:"op"`
	ID        string `json:"id,omitempty"`
	Text      string `json:"text,omitempty"`
	Key       string `json:"key,omitempty"`
	N         int    `json:"n,omitempty"`
	ProjectID string `json:"projectId,omitempty"`
	Agent     string `json:"agent,omitempty"`
	Token     string `json:"token,omitempty"`
	Secret    string `json:"secret,omitempty"`
	Name      string `json:"name,omitempty"`
}

// message is a reply (Rid set) or an event (Ev set).
type message struct {
	Rid   int    `json:"rid,omitempty"`
	Ev    string `json:"ev,omitempty"`
	Ts    int64  `json:"ts"`
	Error string `json:"error,omitempty"`
	Data  any    `json:"data,omitempty"`
}

type state struct {
	Mac      string          `json:"mac"`
	Projects []store.Project `json:"projects"`
	Agents   []agents.Info   `json:"agents"`
	Sessions []sessions.Info `json:"sessions"`
}

func (r *Remote) handle(f frame) {
	switch f.T {
	case "presence":
		r.mu.Lock()
		r.online[f.ID] = f.Online
		if !f.Online {
			delete(r.open, f.ID)
		}
		r.mu.Unlock()
		r.changed()
	case "msg":
		r.handleMsg(f.From, f.Data)
	}
}

func (r *Remote) handleMsg(from, data string) {
	peer, nonce, plain, err := open(r.box, from, r.id, data)
	if err != nil {
		return
	}
	var req request
	if json.Unmarshal(plain, &req) != nil {
		return
	}
	now := time.Now()
	age := now.Sub(time.UnixMilli(req.Ts))
	r.mu.Lock()
	for n, t := range r.seen {
		if now.Sub(t) > maxAge {
			delete(r.seen, n)
		}
	}
	if _, dup := r.seen[nonce]; dup || age > maxAge || age < -maxAge {
		r.mu.Unlock()
		return
	}
	r.seen[nonce] = now
	phone := r.phoneLocked(from)
	known := phone != nil && phone.Box == b64(peer.Bytes())
	r.mu.Unlock()

	if req.Op == "pair" {
		r.pair(from, peer, req)
		return
	}
	if !known {
		return
	}
	data2, err := r.do(from, req)
	reply := message{Rid: req.Rid, Data: data2}
	if err != nil {
		reply = message{Rid: req.Rid, Error: err.Error()}
	}
	r.sendTo(from, peer, reply)
}

func (r *Remote) phoneLocked(id string) *Phone {
	for i := range r.s.Phones {
		if r.s.Phones[i].ID == id {
			return &r.s.Phones[i]
		}
	}
	return nil
}

func (r *Remote) pair(from string, peer *ecdh.PublicKey, req request) {
	r.mu.Lock()
	p := r.pairing
	ok := p != nil && time.Now().Before(r.expires) &&
		subtle.ConstantTimeCompare([]byte(req.Secret), []byte(p.Secret)) == 1
	if ok {
		name := req.Name
		if name == "" || len(name) > 64 {
			name = "Phone"
		}
		if old := r.phoneLocked(from); old != nil {
			old.Box, old.Name = b64(peer.Bytes()), name
		} else {
			r.s.Phones = append(r.s.Phones, Phone{ID: from, Box: b64(peer.Bytes()), Name: name, AddedAt: time.Now().UnixMilli()})
		}
		r.pairing = nil
		if err := r.saveLocked(); err != nil {
			log.Printf("remote: saving pairing: %v", err)
		}
		r.online[from] = true
	}
	c := r.client
	var ids []string
	for _, ph := range r.s.Phones {
		ids = append(ids, ph.ID)
	}
	r.mu.Unlock()
	if !ok {
		r.sendTo(from, peer, message{Rid: req.Rid, Error: "pairing code expired; show a new QR code on the Mac"})
		return
	}
	if c != nil {
		c.write(frame{T: "watch", IDs: ids})
	}
	r.sendTo(from, peer, message{Rid: req.Rid, Data: map[string]string{"mac": r.name}})
	r.changed()
}

func (r *Remote) do(from string, q request) (any, error) {
	d := r.deck
	switch q.Op {
	case "state":
		return state{Mac: r.name, Projects: d.Projects(), Agents: d.Agents(), Sessions: d.Sessions()}, nil
	case "open":
		r.mu.Lock()
		r.open[from] = q.ID
		r.mu.Unlock()
		if q.ID == "" {
			return nil, nil
		}
		items, err := d.Items(q.ID)
		if len(items) > maxItems {
			items = items[len(items)-maxItems:]
		}
		return items, err
	case "start":
		return d.Start(q.ProjectID, q.Agent)
	case "send":
		return nil, d.Send(q.ID, q.Text)
	case "key":
		return nil, d.Key(q.ID, q.Key)
	case "answer":
		return nil, d.Answer(q.ID, q.N)
	case "wake":
		return nil, d.Wake(q.ID)
	case "sleep":
		return nil, d.Sleep(q.ID)
	case "close":
		return nil, d.Close(q.ID)
	case "push":
		r.mu.Lock()
		if p := r.phoneLocked(from); p != nil && p.PushToken != q.Token {
			p.PushToken = q.Token
			r.saveLocked()
		}
		r.mu.Unlock()
		return nil, nil
	}
	return nil, errors.New("unknown request")
}

func (r *Remote) sendTo(id string, peer *ecdh.PublicKey, m message) {
	r.mu.Lock()
	c := r.client
	r.mu.Unlock()
	if c == nil {
		return
	}
	m.Ts = time.Now().UnixMilli()
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	data, err := seal(r.box, peer, r.id, id, b)
	if err != nil {
		return
	}
	c.write(frame{T: "send", To: id, Data: data})
}

// broadcast sends an event to online phones; only, when set, filters them.
func (r *Remote) broadcast(m message, only func(phone string) bool) {
	r.mu.Lock()
	type target struct {
		id  string
		box string
	}
	var ts []target
	for _, p := range r.s.Phones {
		if r.online[p.ID] && (only == nil || only(p.ID)) {
			ts = append(ts, target{p.ID, p.Box})
		}
	}
	r.mu.Unlock()
	for _, t := range ts {
		kb, err := unb64(t.box)
		if err != nil {
			continue
		}
		peer, err := ecdh.X25519().NewPublicKey(kb)
		if err != nil {
			continue
		}
		r.sendTo(t.id, peer, m)
	}
}

// SessionChanged, SessionRemoved and Items mirror the UI events to phones.
func (r *Remote) SessionChanged(i sessions.Info) {
	r.broadcast(message{Ev: "session", Data: i}, nil)
	r.mu.Lock()
	prev := r.status[i.ID]
	r.status[i.ID] = i.Status
	var tokens []string
	for _, p := range r.s.Phones {
		if p.PushToken != "" {
			tokens = append(tokens, p.PushToken)
		}
	}
	r.mu.Unlock()
	title := ""
	switch {
	case i.Status == sessions.StatusWaiting && prev != sessions.StatusWaiting:
		title = agentName(i.Agent) + " needs you"
	case i.Status == sessions.StatusIdle && prev == sessions.StatusWorking:
		title = agentName(i.Agent) + " finished"
	}
	if title == "" || r.push == nil {
		return
	}
	// Push text goes through Expo and Google, so it says nothing about the work.
	for _, t := range tokens {
		go r.push(t, title, "Open agentdeck to see it.", i.ID)
	}
}

func (r *Remote) SessionRemoved(id string) {
	r.mu.Lock()
	delete(r.status, id)
	r.mu.Unlock()
	r.broadcast(message{Ev: "removed", Data: id}, nil)
}

func (r *Remote) Items(ev sessions.ItemsEvent) {
	r.broadcast(message{Ev: "items", Data: ev}, func(phone string) bool { return r.open[phone] == ev.ID })
}

func agentName(id string) string {
	for _, a := range agents.List() {
		if a.ID == id {
			return a.Name
		}
	}
	return "Agent"
}
