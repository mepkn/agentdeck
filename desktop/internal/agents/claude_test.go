package agents

import "testing"

func TestClaudeParser(t *testing.T) {
	p := claude{}.NewParser()
	lines := []string{
		`{"type":"user","uuid":"u1","message":{"content":"fix the bug"}}`,
		`{"type":"user","uuid":"m1","isMeta":true,"message":{"content":"hidden"}}`,
		`{"type":"user","uuid":"c1","message":{"content":"<command-name>/model</command-name>\n<command-args>opus</command-args>"}}`,
		`{"type":"assistant","uuid":"a1","message":{"content":[{"type":"thinking","thinking":"..."}]}}`,
		`{"type":"assistant","uuid":"a2","message":{"content":[{"type":"text","text":"Looking."}]}}`,
		`{"type":"assistant","uuid":"a3","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls -la\nmore","description":"List"}}]}}`,
		`{"type":"user","uuid":"r1","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"a.go"}]}]}}`,
		`{"type":"system","uuid":"s1"}`,
	}
	var got []Item
	for _, l := range lines {
		got = append(got, p.Feed([]byte(l))...)
	}
	if len(got) != 5 {
		t.Fatalf("got %d items: %+v", len(got), got)
	}
	if got[0].Kind != "user" || got[0].Text != "fix the bug" {
		t.Errorf("user item: %+v", got[0])
	}
	if got[1].Text != "/model opus" {
		t.Errorf("command item: %q", got[1].Text)
	}
	if got[2].Kind != "assistant" || got[2].Text != "Looking." {
		t.Errorf("assistant item: %+v", got[2])
	}
	if got[3].Tool.Summary != "ls -la" || got[3].Tool.Done {
		t.Errorf("tool call: %+v", got[3].Tool)
	}
	if got[4].ID != "t1" || !got[4].Tool.Done || got[4].Tool.Output != "a.go" {
		t.Errorf("tool result: %+v", got[4].Tool)
	}
}

func TestClaudeLogPath(t *testing.T) {
	got := claude{}.LogPath("/Users/me/my.app", "abc")
	want := "/.claude/projects/-Users-me-my-app/abc.jsonl"
	if len(got) < len(want) || got[len(got)-len(want):] != want {
		t.Errorf("LogPath = %s", got)
	}
}
