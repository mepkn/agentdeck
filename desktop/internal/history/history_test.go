package history

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSearch(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "-Users-me-app")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	log := `{"type":"user","cwd":"/Users/me/app","timestamp":"2026-10-01T10:00:00Z","uuid":"a","message":{"role":"user","content":"Add a lazygit button"}}
{"type":"assistant","timestamp":"2026-10-01T10:00:01Z","uuid":"b","message":{"content":[{"type":"text","text":"lazygit done"}]}}
{"type":"user","cwd":"/Users/me/app","timestamp":"2026-10-01T10:01:00Z","uuid":"c","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"lazygit"}]}}
{"type":"user","cwd":"/Users/me/app","timestamp":"2026-10-02T10:00:00Z","uuid":"d","message":{"role":"user","content":"<pasted_content id=\"1\">fix the LAZYGIT install</pasted_content>"}}
{"type":"ai-title","aiTitle":"Lazygit button"}
`
	if err := os.WriteFile(filepath.Join(dir, "s1.jsonl"), []byte(log), 0o600); err != nil {
		t.Fatal(err)
	}
	x := &Index{root: root, files: map[string]*file{}}
	got := x.Search("lazygit", 10)
	if len(got) != 2 {
		t.Fatalf("got %d matches, want 2: %+v", len(got), got)
	}
	if got[0].Text != "fix the LAZYGIT install" || got[0].Dir != "/Users/me/app" ||
		got[0].AgentSessionID != "s1" || got[0].Title != "Lazygit button" {
		t.Errorf("newest match = %+v", got[0])
	}
	if n := len(x.Search("lazygit button", 10)); n != 1 {
		t.Errorf("every word must match: got %d", n)
	}
	ss := x.Sessions()
	if len(ss) != 1 || ss[0].AgentSessionID != "s1" || ss[0].Dir != "/Users/me/app" || ss[0].Title != "Lazygit button" {
		t.Errorf("sessions = %+v", ss)
	}
	if n := len(x.Search("", 10)); n != 0 {
		t.Errorf("empty query: got %d", n)
	}
}

func TestSnippet(t *testing.T) {
	long := ""
	for range 50 {
		long += "padding "
	}
	s := snippet(long+"needle "+long, long+"needle "+long, "needle")
	if len([]rune(s)) > 242 || s[:3] != "…" {
		t.Errorf("snippet = %q", s)
	}
}
