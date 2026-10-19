package remote

import (
	"context"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/sessions"
	"github.com/mepkn/agentdeck/desktop/internal/store"
	"github.com/mepkn/agentdeck/relay/hub"
)

type fakeDeck struct {
	mu   sync.Mutex
	sent []string
}

func (f *fakeDeck) Projects() []store.Project { return []store.Project{{ID: "p1", Name: "app"}} }
func (f *fakeDeck) Agents() []agents.Info     { return nil }
func (f *fakeDeck) Sessions() []sessions.Info {
	return []sessions.Info{{Session: store.Session{ID: "s1", ProjectID: "p1", Agent: "claude"}, Status: "idle"}}
}
func (f *fakeDeck) Items(string) ([]agents.Item, error) {
	return []agents.Item{{ID: "a", Kind: "assistant", Text: "hi"}}, nil
}
func (f *fakeDeck) Start(string, string) (sessions.Info, error) { return sessions.Info{}, nil }
func (f *fakeDeck) Send(id, text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, id+":"+text)
	return nil
}
func (f *fakeDeck) Key(string, string) error { return nil }
func (f *fakeDeck) Answer(string, int) error { return nil }
func (f *fakeDeck) Wake(string) error        { return nil }
func (f *fakeDeck) Sleep(string) error       { return nil }
func (f *fakeDeck) Close(string) error       { return nil }

// phone plays the Android app's part.
type phone struct {
	t     *testing.T
	c     *client
	box   *ecdh.PrivateKey
	mac   string
	macK  *ecdh.PublicKey
	in    chan message
	ready chan struct{}
	rid   int
}

func newPhone(t *testing.T, url string) *phone {
	_, key, _ := ed25519.GenerateKey(nil)
	box, _ := ecdh.X25519().GenerateKey(rand.Reader)
	p := &phone{t: t, box: box, in: make(chan message, 16), ready: make(chan struct{}, 1)}
	p.c = &client{url: url, key: key, id: b64(key.Public().(ed25519.PublicKey))}
	p.c.onConnected = func(ok bool) {
		if ok {
			p.ready <- struct{}{}
		}
	}
	p.c.onFrame = func(f frame) {
		if f.T != "msg" {
			return
		}
		_, _, plain, err := open(p.box, f.From, p.c.id, f.Data)
		if err != nil {
			t.Errorf("phone can't open: %v", err)
			return
		}
		var m message
		json.Unmarshal(plain, &m)
		p.in <- m
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go p.c.run(ctx)
	<-p.ready
	return p
}

func (p *phone) ask(q request) message {
	p.t.Helper()
	p.rid++
	q.Rid, q.Ts = p.rid, time.Now().UnixMilli()
	b, _ := json.Marshal(q)
	data, _ := seal(p.box, p.macK, p.c.id, p.mac, b)
	if err := p.c.write(frame{T: "send", To: p.mac, Data: data}); err != nil {
		p.t.Fatal(err)
	}
	for {
		select {
		case m := <-p.in:
			if m.Rid == q.Rid {
				return m
			}
		case <-time.After(3 * time.Second):
			p.t.Fatalf("no reply to %s", q.Op)
		}
	}
}

func (p *phone) event(name string) message {
	p.t.Helper()
	for {
		select {
		case m := <-p.in:
			if m.Ev == name {
				return m
			}
		case <-time.After(3 * time.Second):
			p.t.Fatalf("no %s event", name)
		}
	}
}

func TestPairAndControl(t *testing.T) {
	srv := httptest.NewServer(hub.New())
	t.Cleanup(srv.Close)
	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	deck := &fakeDeck{}
	var mu sync.Mutex
	var pushes []string
	path := filepath.Join(t.TempDir(), "remote.json")
	mac, err := New(path, url, "Test Mac", deck, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mac.Shutdown)
	mac.push = func(_, title, _, _ string) {
		mu.Lock()
		pushes = append(pushes, title)
		mu.Unlock()
	}
	qr := mac.StartPairing()
	deadline := time.Now().Add(3 * time.Second)
	for !mac.Status().Connected && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}

	p := newPhone(t, url)
	p.mac = qr.ID
	kb, _ := unb64(qr.Box)
	p.macK, _ = ecdh.X25519().NewPublicKey(kb)

	// An unpaired phone gets no answer except to pairing.
	if m := p.ask(request{Op: "pair", Secret: "wrong"}); m.Error == "" {
		t.Fatal("wrong secret paired")
	}
	if m := p.ask(request{Op: "pair", Secret: qr.Secret, Name: "Pixel"}); m.Error != "" {
		t.Fatal(m.Error)
	}
	st := mac.Status()
	if st.Pairing || len(st.Phones) != 1 || st.Phones[0].Name != "Pixel" {
		t.Fatalf("status %+v", st)
	}

	m := p.ask(request{Op: "state"})
	if m.Error != "" {
		t.Fatal(m.Error)
	}
	if b, _ := json.Marshal(m.Data); !strings.Contains(string(b), `"s1"`) {
		t.Fatalf("state %s", b)
	}
	p.ask(request{Op: "send", ID: "s1", Text: "hello"})
	if len(deck.sent) != 1 || deck.sent[0] != "s1:hello" {
		t.Fatalf("sent %v", deck.sent)
	}
	p.ask(request{Op: "open", ID: "s1"})
	p.ask(request{Op: "push", Token: "ExponentPushToken[x]"})

	mac.Items(sessions.ItemsEvent{ID: "s1", Items: []agents.Item{{ID: "b"}}})
	p.event("items")
	mac.SessionChanged(sessions.Info{Session: store.Session{ID: "s1", Agent: "claude"}, Status: sessions.StatusWaiting})
	p.event("session")
	time.Sleep(50 * time.Millisecond)
	mu.Lock()
	if len(pushes) != 1 || pushes[0] != "Claude Code needs you" {
		t.Fatalf("pushes %v", pushes)
	}
	mu.Unlock()

	// The pairing survives a restart.
	mac.Shutdown()
	again, err := New(path, url, "Test Mac", deck, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Shutdown()
	if s := again.Status(); len(s.Phones) != 1 || s.Phones[0].Name != "Pixel" {
		t.Fatalf("after restart %+v", s)
	}
}

func TestRejectsReplay(t *testing.T) {
	mac, err := New(filepath.Join(t.TempDir(), "r.json"), "ws://unused", "Mac", &fakeDeck{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	box, _ := ecdh.X25519().GenerateKey(rand.Reader)
	mac.s.Phones = []Phone{{ID: "phone", Box: b64(box.PublicKey().Bytes())}}
	deck := mac.deck.(*fakeDeck)
	b, _ := json.Marshal(request{Op: "send", ID: "s1", Text: "x", Ts: time.Now().UnixMilli()})
	data, _ := seal(box, mac.box.PublicKey(), "phone", mac.id, b)
	mac.handleMsg("phone", data)
	mac.handleMsg("phone", data)
	if len(deck.sent) != 1 {
		t.Fatalf("replayed: %v", deck.sent)
	}
	old, _ := json.Marshal(request{Op: "send", ID: "s1", Text: "x", Ts: time.Now().Add(-time.Hour).UnixMilli()})
	data, _ = seal(box, mac.box.PublicKey(), "phone", mac.id, old)
	mac.handleMsg("phone", data)
	if len(deck.sent) != 1 {
		t.Fatalf("old message accepted: %v", deck.sent)
	}
}
