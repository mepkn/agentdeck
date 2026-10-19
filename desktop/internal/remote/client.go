package remote

import (
	"context"
	"crypto/ed25519"
	"errors"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// authPrefix must match the relay's.
const authPrefix = "agentdeck-relay-v1:"

// frame is the relay's wire format.
type frame struct {
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

var errOffline = errors.New("not connected to the relay")

// client keeps one connection to the relay open, reconnecting with backoff.
type client struct {
	url string
	key ed25519.PrivateKey
	id  string

	onFrame     func(frame)
	onConnected func(bool)

	mu sync.Mutex
	ws *websocket.Conn
}

func (c *client) run(ctx context.Context) {
	wait := time.Second
	for ctx.Err() == nil {
		start := time.Now()
		c.serve(ctx)
		if time.Since(start) > time.Minute {
			wait = time.Second
		}
		select {
		case <-ctx.Done():
		case <-time.After(wait):
		}
		wait = min(wait*2, 30*time.Second)
	}
}

func (c *client) serve(ctx context.Context) {
	dctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	ws, _, err := websocket.Dial(dctx, c.url, nil)
	cancel()
	if err != nil {
		return
	}
	defer ws.CloseNow()
	ws.SetReadLimit(4 << 20)
	if err := c.auth(ctx, ws); err != nil {
		return
	}
	c.mu.Lock()
	c.ws = ws
	c.mu.Unlock()
	c.onConnected(true)
	defer func() {
		c.mu.Lock()
		c.ws = nil
		c.mu.Unlock()
		c.onConnected(false)
	}()

	// Keep the connection alive through proxies that drop idle sockets.
	pctx, stop := context.WithCancel(ctx)
	defer stop()
	go func() {
		t := time.NewTicker(25 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-pctx.Done():
				return
			case <-t.C:
				c.write(frame{T: "ping"})
			}
		}
	}()

	for {
		var f frame
		if err := wsjson.Read(ctx, ws, &f); err != nil {
			return
		}
		c.onFrame(f)
	}
}

func (c *client) auth(ctx context.Context, ws *websocket.Conn) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var ch frame
	if err := wsjson.Read(ctx, ws, &ch); err != nil {
		return err
	}
	nonce, err := unb64(ch.Nonce)
	if ch.T != "challenge" || err != nil {
		return errors.New("relay: bad challenge")
	}
	sig := ed25519.Sign(c.key, append([]byte(authPrefix), nonce...))
	if err := wsjson.Write(ctx, ws, frame{T: "hello", ID: c.id, Sig: b64(sig)}); err != nil {
		return err
	}
	var f frame
	if err := wsjson.Read(ctx, ws, &f); err != nil {
		return err
	}
	if f.T != "ready" {
		return errors.New("relay: not ready")
	}
	return nil
}

func (c *client) write(f frame) error {
	c.mu.Lock()
	ws := c.ws
	c.mu.Unlock()
	if ws == nil {
		return errOffline
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return wsjson.Write(ctx, ws, f)
}
