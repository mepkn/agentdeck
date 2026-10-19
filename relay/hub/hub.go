// Package hub is the relay: devices prove they own an Ed25519 key, then
// send opaque (end-to-end encrypted) blobs to each other by device ID.
package hub

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	// AuthPrefix is signed together with the challenge, so a signature can't
	// be reused for anything else.
	AuthPrefix   = "agentdeck-relay-v1:"
	maxMessage   = 4 << 20
	maxConns     = 500
	pingInterval = 30 * time.Second
	// A device may send this many messages per second, with bursts up to rateBurst.
	rateLimit = 50
	rateBurst = 200
)

// Frame is every message on the wire, in both directions.
type Frame struct {
	T      string   `json:"t"`
	Nonce  string   `json:"nonce,omitempty"`
	ID     string   `json:"id,omitempty"`
	Sig    string   `json:"sig,omitempty"`
	To     string   `json:"to,omitempty"`
	From   string   `json:"from,omitempty"`
	Data   string   `json:"data,omitempty"`
	IDs    []string `json:"ids,omitempty"`
	Online bool     `json:"online,omitempty"`
	Error  string   `json:"error,omitempty"`
}

type conn struct {
	id    string
	ws    *websocket.Conn
	out   chan Frame
	watch map[string]bool
	done  chan struct{}
}

type Hub struct {
	mu    sync.Mutex
	conns map[string]*conn
	total int
}

func New() *Hub { return &Hub{conns: map[string]*conn{}} }

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	full := h.total >= maxConns
	if !full {
		h.total++
	}
	h.mu.Unlock()
	if full {
		http.Error(w, "busy", http.StatusServiceUnavailable)
		return
	}
	defer func() {
		h.mu.Lock()
		h.total--
		h.mu.Unlock()
	}()

	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	ws.SetReadLimit(maxMessage)
	defer ws.CloseNow()
	ctx := r.Context()

	id, err := authenticate(ctx, ws)
	if err != nil {
		ws.Close(websocket.StatusPolicyViolation, "auth failed")
		return
	}
	c := &conn{id: id, ws: ws, out: make(chan Frame, 64), watch: map[string]bool{}, done: make(chan struct{})}
	h.add(c)
	defer h.remove(c)

	go c.writeLoop(ctx)
	c.send(Frame{T: "ready", ID: id})
	h.readLoop(ctx, c)
}

func authenticate(ctx context.Context, ws *websocket.Conn) (string, error) {
	nonce := make([]byte, 32)
	rand.Read(nonce)
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := wsjson.Write(ctx, ws, Frame{T: "challenge", Nonce: b64(nonce)}); err != nil {
		return "", err
	}
	var f Frame
	if err := wsjson.Read(ctx, ws, &f); err != nil {
		return "", err
	}
	pub, err1 := unb64(f.ID)
	sig, err2 := unb64(f.Sig)
	if f.T != "hello" || err1 != nil || err2 != nil || len(pub) != ed25519.PublicKeySize {
		return "", errAuth
	}
	if !ed25519.Verify(pub, append([]byte(AuthPrefix), nonce...), sig) {
		return "", errAuth
	}
	return f.ID, nil
}

type authError struct{}

func (authError) Error() string { return "auth failed" }

var errAuth = authError{}

func (h *Hub) add(c *conn) {
	h.mu.Lock()
	old := h.conns[c.id]
	h.conns[c.id] = c
	var watchers []*conn
	for _, o := range h.conns {
		if o.watch[c.id] {
			watchers = append(watchers, o)
		}
	}
	h.mu.Unlock()
	// A device that reconnects replaces its old connection.
	if old != nil {
		old.ws.Close(websocket.StatusGoingAway, "replaced")
	}
	for _, w := range watchers {
		w.send(Frame{T: "presence", ID: c.id, Online: true})
	}
}

func (h *Hub) remove(c *conn) {
	close(c.done)
	h.mu.Lock()
	if h.conns[c.id] != c {
		h.mu.Unlock()
		return
	}
	delete(h.conns, c.id)
	var watchers []*conn
	for _, o := range h.conns {
		if o.watch[c.id] {
			watchers = append(watchers, o)
		}
	}
	h.mu.Unlock()
	for _, w := range watchers {
		w.send(Frame{T: "presence", ID: c.id, Online: false})
	}
}

func (h *Hub) readLoop(ctx context.Context, c *conn) {
	tokens, last := float64(rateBurst), time.Now()
	for {
		var f Frame
		if err := wsjson.Read(ctx, c.ws, &f); err != nil {
			return
		}
		now := time.Now()
		tokens = min(rateBurst, tokens+now.Sub(last).Seconds()*rateLimit)
		last = now
		if tokens < 1 {
			c.send(Frame{T: "error", Error: "rate limited"})
			continue
		}
		tokens--

		switch f.T {
		case "send":
			h.mu.Lock()
			to := h.conns[f.To]
			h.mu.Unlock()
			if to == nil {
				c.send(Frame{T: "offline", ID: f.To})
				continue
			}
			to.send(Frame{T: "msg", From: c.id, Data: f.Data})
		case "watch":
			h.mu.Lock()
			c.watch = map[string]bool{}
			var online []string
			for _, id := range f.IDs[:min(len(f.IDs), 32)] {
				c.watch[id] = true
				if h.conns[id] != nil {
					online = append(online, id)
				}
			}
			ids := f.IDs[:min(len(f.IDs), 32)]
			h.mu.Unlock()
			for _, id := range ids {
				c.send(Frame{T: "presence", ID: id, Online: contains(online, id)})
			}
		case "ping":
			c.send(Frame{T: "pong"})
		default:
			c.send(Frame{T: "error", Error: "unknown frame"})
		}
	}
}

// send queues a frame; a device too slow to keep up is dropped.
func (c *conn) send(f Frame) {
	select {
	case c.out <- f:
	case <-c.done:
	default:
		log.Printf("relay: dropping slow device %.8s", c.id)
		c.ws.Close(websocket.StatusPolicyViolation, "too slow")
	}
}

func (c *conn) writeLoop(ctx context.Context) {
	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case f := <-c.out:
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := wsjson.Write(wctx, c.ws, f)
			cancel()
			if err != nil {
				c.ws.CloseNow()
				return
			}
		case <-t.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.ws.CloseNow()
				return
			}
		case <-c.done:
			return
		}
	}
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func unb64(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }
