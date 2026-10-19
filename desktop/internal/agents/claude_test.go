package agents

import "testing"

func TestClaudeParser(t *testing.T) {
	p := claude{}.NewParser()
	lines := []string{
		`{"type":"user","uuid":"u1","message":{"content":"fix the bug"}}`,
		`{"type":"user","uuid":"m1","isMeta":true,"message":{"content":"hidden"}}`,
		`{"type":"user","uuid":"c1","message":{"content":"<command-name>/model</command-name>\n<command-args>opus</command-args>"}}`,
		`{"type":"user","uuid":"n1","message":{"content":"<task-notification>\n<task-id>b1</task-id>\n<status>stopped</status>\n</task-notification>"}}`,
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

func TestClaudeReadStatus(t *testing.T) {
	var m Meta
	claude{}.ReadStatus([]byte(`{"model":{"id":"claude-opus-5-5","display_name":"Opus 5.5"},
		"context_window":{"context_window_size":1000000,"current_usage":{"input_tokens":2,"cache_creation_input_tokens":79,"cache_read_input_tokens":67435}}}`), &m)
	if m.Model != "Opus 5.5" || m.ContextWindow != 1000000 || m.ContextUsed != 67516 {
		t.Fatalf("got %+v", m)
	}
	claude{}.ReadStatus([]byte(`{"model":{"display_name":"Opus 5.5"},"context_window":{"context_window_size":200000,"current_usage":null}}`), &m)
	if m.ContextUsed != 0 || m.ContextWindow != 200000 {
		t.Fatalf("no usage yet: got %+v", m)
	}
}

func TestClaudeScreenMode(t *testing.T) {
	lines := []string{"────", "❯", "────", "  ⏵⏵ accept edits on (shift+tab to cycle)"}
	if got := (claude{}).ScreenMode(lines, true); got != "acceptEdits" {
		t.Fatalf("got %q", got)
	}
	lines[3] = "  ? for shortcuts"
	if got := (claude{}).ScreenMode(lines, true); got != "default" {
		t.Fatalf("idle with no mode shown: got %q", got)
	}
	if got := (claude{}).ScreenMode(lines, false); got != "" {
		t.Fatalf("busy with no mode shown: got %q", got)
	}
	if got := (claude{}).ScreenMode([]string{"⏺ OK"}, true); got != "" {
		t.Fatalf("no input box yet: got %q", got)
	}
}

func TestReadModelList(t *testing.T) {
	ml := readModelList([]string{
		"  1. Some numbered chat line",
		"   Select model",
		"     1.  Default (recommended)  Haiku 5.5",
		"   ❯ 2.  Opus 5.5 ✔             For complex work and everyday tasks",
		"     3.  Sonnet 5.5             Most efficient for simpler tasks",
		"   ↓ 6.  Haiku 4.5              Fastest for quick answers",
		"   ◉ xHigh effort ←/→ to adjust",
		"   Enter to set as default · s to use this session only · Esc to cancel",
	})
	if !ml.ready || ml.cursor != 1 || ml.current != 1 || ml.effort != "xhigh" {
		t.Fatalf("got %+v", ml)
	}
	if ml.rows[0] != "Default (recommended)" || ml.rows[1] != "Opus 5.5" || ml.rows[3] != "Haiku 4.5" {
		t.Fatalf("rows %q", ml.rows)
	}
}

func TestCleanUserTextPaste(t *testing.T) {
	in := "\n\n<pasted_content id=\"a007\">\nit says:\n\nmacos\n</pasted_content id=\"a007\">\n"
	if got, want := cleanUserText(in), "it says:\n\nmacos"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
