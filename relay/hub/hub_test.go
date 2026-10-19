package hub

import (
	"context"
	"crypto/ed25519"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type device struct {
	t   *testing.T
	id  string
	ws  *websocket.Conn
	ctx context.Context
}

func dial(t *testing.T, url string, key ed25519.PrivateKey) (*websocket.Conn, Frame) {
	t.Helper()
	ctx := context.Background()
	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	var ch Frame
	if err := wsjson.Read(ctx, ws, &ch); err != nil || ch.T != "challenge" {
		t.Fatalf("challenge: %v %+v", err, ch)
	}
	nonce, _ := unb64(ch.Nonce)
	pub := key.Public().(ed25519.PublicKey)
	sig := ed25519.Sign(key, append([]byte(AuthPrefix), nonce...))
	wsjson.Write(ctx, ws, Frame{T: "hello", ID: b64(pub), Sig: b64(sig)})
	var f Frame
	wsjson.Read(ctx, ws, &f)
	return ws, f
}

func connect(t *testing.T, url string) *device {
	_, key, _ := ed25519.GenerateKey(nil)
	ws, f := dial(t, url, key)
	if f.T != "ready" {
		t.Fatalf("want ready, got %+v", f)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return &device{t: t, id: f.ID, ws: ws, ctx: context.Background()}
}

func (d *device) write(f Frame) {
	if err := wsjson.Write(d.ctx, d.ws, f); err != nil {
		d.t.Fatal(err)
	}
}

func (d *device) read() Frame {
	ctx, cancel := context.WithTimeout(d.ctx, 2*time.Second)
	defer cancel()
	var f Frame
	if err := wsjson.Read(ctx, d.ws, &f); err != nil {
		d.t.Fatal(err)
	}
	return f
}

func server(t *testing.T) string {
	s := httptest.NewServer(New())
	t.Cleanup(s.Close)
	return "ws" + strings.TrimPrefix(s.URL, "http")
}

func TestForwardsBetweenDevices(t *testing.T) {
	url := server(t)
	mac, phone := connect(t, url), connect(t, url)

	phone.write(Frame{T: "send", To: mac.id, Data: "secret-blob"})
	got := mac.read()
	if got.T != "msg" || got.From != phone.id || got.Data != "secret-blob" {
		t.Fatalf("got %+v", got)
	}
}

func TestOfflineAndPresence(t *testing.T) {
	url := server(t)
	phone := connect(t, url)
	_, macKey, _ := ed25519.GenerateKey(nil)
	macID := b64(macKey.Public().(ed25519.PublicKey))

	phone.write(Frame{T: "send", To: macID, Data: "x"})
	if f := phone.read(); f.T != "offline" || f.ID != macID {
		t.Fatalf("got %+v", f)
	}
	phone.write(Frame{T: "watch", IDs: []string{macID}})
	if f := phone.read(); f.T != "presence" || f.Online {
		t.Fatalf("got %+v", f)
	}
	ws, _ := dial(t, url, macKey)
	if f := phone.read(); f.T != "presence" || !f.Online || f.ID != macID {
		t.Fatalf("got %+v", f)
	}
	ws.CloseNow()
	if f := phone.read(); f.T != "presence" || f.Online {
		t.Fatalf("got %+v", f)
	}
}

func TestRejectsBadSignature(t *testing.T) {
	url := server(t)
	ctx := context.Background()
	ws, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	var ch Frame
	wsjson.Read(ctx, ws, &ch)
	pub, key, _ := ed25519.GenerateKey(nil)
	sig := ed25519.Sign(key, []byte("wrong"))
	wsjson.Write(ctx, ws, Frame{T: "hello", ID: b64(pub), Sig: b64(sig)})
	var f Frame
	if err := wsjson.Read(ctx, ws, &f); websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Fatalf("want policy violation, got %v %+v", err, f)
	}
}
