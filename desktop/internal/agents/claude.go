package agents

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

// Claude Code writes ~/.claude/projects/<dir with non-alphanumerics as ->/<session>.jsonl,
// one JSON object per line, one content block per assistant line.
type claude struct{}

func init() { register(claude{}) }

func (claude) ID() string           { return "claude" }
func (claude) Name() string         { return "Claude Code" }
func (claude) Binary() string       { return "claude" }
func (claude) NewSessionID() string { return uuid.NewString() }

func (claude) Args(l Launch) []string {
	if l.Resume {
		return []string{"--resume", l.AgentSessionID}
	}
	return []string{"--session-id", l.AgentSessionID}
}

var nonAlnum = regexp.MustCompile(`[^A-Za-z0-9]`)

func (claude) LogPath(dir, id string) string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "projects", nonAlnum.ReplaceAllString(dir, "-"), id+".jsonl")
}

func (claude) NewParser() Parser { return &claudeParser{tools: map[string]*Item{}} }

type claudeParser struct {
	tools map[string]*Item
}

type claudeLine struct {
	Type        string `json:"type"`
	UUID        string `json:"uuid"`
	Timestamp   string `json:"timestamp"`
	IsMeta      bool   `json:"isMeta"`
	IsSidechain bool   `json:"isSidechain"`
	Message     struct {
		Content json.RawMessage `json:"content"`
	} `json:"message"`
}

type claudeBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Input     json.RawMessage `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
	IsError   bool            `json:"is_error"`
}

func (p *claudeParser) Feed(line []byte) []Item {
	var l claudeLine
	if json.Unmarshal(line, &l) != nil || l.IsMeta || l.IsSidechain {
		return nil
	}
	if l.Type != "user" && l.Type != "assistant" {
		return nil
	}
	var text string
	if json.Unmarshal(l.Message.Content, &text) == nil {
		if l.Type != "user" || hiddenUserText(text) {
			return nil
		}
		return []Item{{ID: l.UUID, Kind: "user", Text: cleanUserText(text), Time: l.Timestamp}}
	}
	var blocks []claudeBlock
	if json.Unmarshal(l.Message.Content, &blocks) != nil {
		return nil
	}
	var out []Item
	for i, b := range blocks {
		switch b.Type {
		case "text":
			if l.Type == "user" && hiddenUserText(b.Text) {
				continue
			}
			if strings.TrimSpace(b.Text) == "" {
				continue
			}
			kind, txt := l.Type, b.Text
			if kind == "user" {
				txt = cleanUserText(txt)
			}
			out = append(out, Item{ID: fmt.Sprintf("%s:%d", l.UUID, i), Kind: kind, Text: txt, Time: l.Timestamp})
		case "tool_use":
			it := &Item{ID: b.ID, Kind: "tool", Time: l.Timestamp, Tool: &Tool{
				Name:    b.Name,
				Summary: toolSummary(b.Name, b.Input),
				Input:   truncate(prettyJSON(b.Input), 4000),
			}}
			p.tools[b.ID] = it
			out = append(out, *it)
		case "tool_result":
			it, ok := p.tools[b.ToolUseID]
			if !ok {
				continue
			}
			t := *it.Tool
			t.Output = truncate(resultText(b.Content), 4000)
			t.IsError = b.IsError
			t.Done = true
			it.Tool = &t
			out = append(out, *it)
		}
	}
	return out
}

// Slash commands, their output and interrupt markers are logged as user
// text; the chat view leaves out everything but what was typed.
func hiddenUserText(s string) bool {
	s = strings.TrimSpace(s)
	return s == "" ||
		strings.HasPrefix(s, "<local-command-") ||
		strings.HasPrefix(s, "<system-reminder>") ||
		strings.HasPrefix(s, "Caveat:") ||
		strings.HasPrefix(s, "[Request interrupted")
}

var commandName = regexp.MustCompile(`(?s)<command-name>(.*?)</command-name>(?:.*?<command-args>(.*?)</command-args>)?`)

func cleanUserText(s string) string {
	if m := commandName.FindStringSubmatch(s); m != nil {
		return strings.TrimSpace(m[1] + " " + m[2])
	}
	return s
}

func toolSummary(name string, input json.RawMessage) string {
	var in map[string]any
	_ = json.Unmarshal(input, &in)
	for _, k := range []string{"command", "file_path", "path", "pattern", "url", "query", "description", "prompt"} {
		if v, ok := in[k].(string); ok && v != "" {
			return truncate(strings.SplitN(v, "\n", 2)[0], 200)
		}
	}
	return name
}

func resultText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var parts []claudeBlock
	if json.Unmarshal(raw, &parts) == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type == "text" {
				b.WriteString(p.Text)
			}
		}
		return b.String()
	}
	return ""
}

func prettyJSON(raw json.RawMessage) string {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return string(raw)
	}
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}
