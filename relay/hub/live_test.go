//go:build live

package hub

import (
	"context"
	"crypto/ed25519"
	"testing"

	"github.com/coder/websocket/wsjson"
)

// go test -tags live -run Live ./hub/ checks the deployed relay end to end.
func TestLive(t *testing.T) {
	url := "wss://agentdeck.pknspace.com/relay"
	_, ka, _ := ed25519.GenerateKey(nil)
	_, kb, _ := ed25519.GenerateKey(nil)
	a, fa := dial(t, url, ka)
	b, fb := dial(t, url, kb)
	defer a.CloseNow()
	defer b.CloseNow()
	if fa.T != "ready" || fb.T != "ready" {
		t.Fatalf("%+v %+v", fa, fb)
	}
	ctx := context.Background()
	wsjson.Write(ctx, a, Frame{T: "send", To: fb.ID, Data: "x"})
	var f Frame
	if err := wsjson.Read(ctx, b, &f); err != nil || f.Data != "x" || f.From != fa.ID {
		t.Fatalf("%v %+v", err, f)
	}
}
