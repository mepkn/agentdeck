package agents

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

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
	args := []string{"--session-id", l.AgentSessionID}
	if l.Resume {
		args = []string{"--resume", l.AgentSessionID}
	}
	if l.StatusFile != "" {
		// The status line command gets the model and context use as JSON on
		// stdin; it saves that and draws nothing.
		cmd := "cat > '" + strings.ReplaceAll(l.StatusFile, "'", `'\''`) + "'"
		b, _ := json.Marshal(map[string]any{"statusLine": map[string]string{"type": "command", "command": cmd}})
		args = append(args, "--settings", string(b))
	}
	return args
}

func (claude) Models() []Choice {
	return []Choice{
		{Value: "fable", Label: "Fable 5.1"},
		{Value: "opus", Label: "Opus 5.5"},
		{Value: "sonnet", Label: "Sonnet 5.5"},
		{Value: "haiku", Label: "Haiku 5.5"},
	}
}

// The order shift+tab cycles through; bypass only when the user allows it.
func (claude) Modes() []Choice {
	return []Choice{
		{Value: "default", Label: "Ask"},
		{Value: "acceptEdits", Label: "Accept edits"},
		{Value: "plan", Label: "Plan"},
		{Value: "auto", Label: "Auto"},
		{Value: "bypassPermissions", Label: "Bypass"},
	}
}

var (
	modelRow   = regexp.MustCompile(`^\s*([❯↑↓]?)\s*\d+\.\s+(.+?)(?:\s{2,}|$)`)
	effortLine = regexp.MustCompile(`(?i)(\w+) effort\b.*to adjust`)
)

func (claude) Efforts() []Choice {
	return []Choice{
		{Value: "low", Label: "Low"},
		{Value: "medium", Label: "Medium"},
		{Value: "high", Label: "High"},
		{Value: "xhigh", Label: "Extra high"},
		{Value: "max", Label: "Max"},
	}
}

// modelList is what Claude's /model list shows.
type modelList struct {
	ready      bool // the "s" key is offered
	rows       []string
	cursor     int
	cursorLine string // the cursor's row as drawn, to see it move
	current    int    // the row with ✔
	effort     string // "" when the row has no effort levels
}

func readModelList(lines []string) modelList {
	var ml modelList
	for _, l := range lines {
		// Numbered lists in the chat above aren't rows.
		if strings.Contains(l, "Select model") {
			ml = modelList{}
		}
		if strings.Contains(l, "to use this session only") {
			ml.ready = true
		}
		if m := effortLine.FindStringSubmatch(l); m != nil {
			ml.effort = strings.ToLower(m[1])
		}
		m := modelRow.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		name := strings.TrimSpace(m[2])
		if n, ok := strings.CutSuffix(name, "✔"); ok {
			name = strings.TrimSpace(n)
			ml.current = len(ml.rows) + 1
		}
		if m[1] == "❯" {
			ml.cursor = len(ml.rows) + 1 // 1-based until found
			ml.cursorLine = strings.TrimSpace(l)
		}
		ml.rows = append(ml.rows, name)
	}
	ml.cursor--
	ml.current-- // -1 when the ✔ row is scrolled out of view
	return ml
}

// Pick sets the model and effort in Claude's /model list and applies them
// with "s", for this session only; Enter, or "/model <name>", would also
// save them as the default for every new session. An empty model keeps the
// current one. When switching models, an effort the new model doesn't offer
// is left at its default.
func (c claude) Pick(t Term, model, effort string) error {
	label := ""
	for _, m := range c.Models() {
		if m.Value == model {
			label = m.Label
		}
	}
	if model != "" && label == "" {
		return errors.New("unknown model")
	}
	if err := t.Write("/model"); err != nil {
		return err
	}
	time.Sleep(150 * time.Millisecond)
	if err := t.Write("\r"); err != nil {
		return err
	}
	fail := func(msg string) error {
		_ = t.Write("\x1b")
		return errors.New(msg)
	}
	wait := func(ok func(modelList) bool) (modelList, bool) {
		var ml modelList
		for range 20 {
			time.Sleep(150 * time.Millisecond)
			if ml = readModelList(t.Lines()); ml.ready && ml.cursor >= 0 && ok(ml) {
				return ml, true
			}
		}
		return ml, false
	}
	ml, ok := wait(func(modelList) bool { return true })
	if !ok {
		return fail("couldn't open Claude's model list")
	}
	// A short terminal shows only the rows near the cursor, so look for
	// the model by moving up to the top, then down, one key at a time;
	// each key is checked on screen, since a burst can outrun the redraw.
	find := func(ml modelList) int {
		if label == "" {
			return ml.current
		}
		for i, r := range ml.rows {
			if r == label {
				return i
			}
		}
		return -1
	}
	up := true
	for range 40 {
		target := find(ml)
		if target >= 0 && target == ml.cursor {
			break
		}
		move := "\x1b[B"
		if (target >= 0 && target < ml.cursor) || (target < 0 && up) {
			move = "\x1b[A"
		}
		before := ml.cursorLine
		if err := t.Write(move); err != nil {
			return err
		}
		next, moved := wait(func(ml modelList) bool { return ml.cursorLine != before })
		if !moved && target < 0 {
			if !up {
				break // at the bottom and not found
			}
			up = false // at the top
		}
		ml = next
	}
	if target := find(ml); target < 0 || target != ml.cursor {
		name := label
		if name == "" {
			name = "the current model"
		}
		return fail("couldn't find " + name + " in Claude's model list")
	}
	if effort != "" {
		want := -1
		for i, e := range c.Efforts() {
			if e.Value == effort {
				want = i
			}
		}
		for range len(c.Efforts()) + 1 {
			if ml.effort == effort || ml.effort == "" {
				break
			}
			at := -1
			for i, e := range c.Efforts() {
				if e.Value == ml.effort {
					at = i
				}
			}
			key := "\x1b[C"
			if want < at {
				key = "\x1b[D"
			}
			before := ml.effort
			if err := t.Write(key); err != nil {
				return err
			}
			ml, _ = wait(func(ml modelList) bool { return ml.effort != before })
			if ml.effort == before {
				break // the end of this model's levels
			}
		}
		if ml.effort != effort && model == "" {
			return fail("this model doesn't offer that effort level")
		}
	}
	return t.Write("s")
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func (claude) ReadStatus(data []byte, m *Meta) {
	var s struct {
		Model struct {
			DisplayName string `json:"display_name"`
		} `json:"model"`
		Effort struct {
			Level string `json:"level"`
		} `json:"effort"`
		Context struct {
			Size  int64 `json:"context_window_size"`
			Usage *struct {
				Input         int64 `json:"input_tokens"`
				CacheCreation int64 `json:"cache_creation_input_tokens"`
				CacheRead     int64 `json:"cache_read_input_tokens"`
			} `json:"current_usage"`
		} `json:"context_window"`
	}
	if json.Unmarshal(data, &s) != nil {
		return
	}
	m.Model = s.Model.DisplayName
	m.Effort = s.Effort.Level
	m.ContextWindow = s.Context.Size
	m.ContextUsed = 0
	if u := s.Context.Usage; u != nil {
		m.ContextUsed = u.Input + u.CacheCreation + u.CacheRead
	}
}

var claudeModes = map[string]string{
	"accept edits on":       "acceptEdits",
	"plan mode on":          "plan",
	"auto mode on":          "auto",
	"bypass permissions on": "bypassPermissions",
}

// The footer under the input names every mode but the default one.
func (claude) ScreenMode(lines []string, idle bool) string {
	for i := len(lines) - 1; i >= 0; i-- {
		l := strings.ToLower(lines[i])
		for text, mode := range claudeModes {
			if strings.Contains(l, text) {
				return mode
			}
		}
	}
	// No mode in the footer means the default one, but only once the input
	// box is drawn: a screen still being redrawn shows no footer either.
	for i := 1; idle && i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "❯" && strings.HasPrefix(strings.TrimSpace(lines[i-1]), "─") {
			return "default"
		}
	}
	return ""
}

var nonAlnum = regexp.MustCompile(`[^A-Za-z0-9]`)

func (claude) LogPath(dir, id string) string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "projects", nonAlnum.ReplaceAllString(dir, "-"), id+".jsonl")
}

func (claude) NewParser() Parser { return &claudeParser{tools: map[string]*Item{}} }

type claudeParser struct {
	tools       map[string]*Item
	context     int64
	aiTitle     string
	customTitle string
}

// Context is the context use of the last reply, for when the status line
// hasn't reported any yet (it doesn't after a resume).
func (p *claudeParser) Context() int64 { return p.context }

// Title is the name set with /rename, else the one Claude Code generated.
func (p *claudeParser) Title() string {
	if p.customTitle != "" {
		return p.customTitle
	}
	return p.aiTitle
}

type claudeLine struct {
	Type        string `json:"type"`
	UUID        string `json:"uuid"`
	Timestamp   string `json:"timestamp"`
	IsMeta      bool   `json:"isMeta"`
	IsSidechain bool   `json:"isSidechain"`
	AITitle     string `json:"aiTitle"`
	CustomTitle string `json:"customTitle"`
	Message     struct {
		Content json.RawMessage `json:"content"`
		Usage   *struct {
			Input         int64 `json:"input_tokens"`
			CacheCreation int64 `json:"cache_creation_input_tokens"`
			CacheRead     int64 `json:"cache_read_input_tokens"`
		} `json:"usage"`
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
	switch l.Type {
	case "ai-title":
		p.aiTitle = strings.TrimSpace(l.AITitle)
		return nil
	case "custom-title":
		p.customTitle = strings.TrimSpace(l.CustomTitle)
		return nil
	}
	if l.Type != "user" && l.Type != "assistant" {
		return nil
	}
	if u := l.Message.Usage; l.Type == "assistant" && u != nil {
		if n := u.Input + u.CacheCreation + u.CacheRead; n > 0 {
			p.context = n
		}
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

// Slash commands, their output, background task notices and interrupt
// markers are logged as user text; the chat view leaves out everything but what was typed.
func hiddenUserText(s string) bool {
	s = strings.TrimSpace(s)
	return s == "" ||
		strings.HasPrefix(s, "<local-command-") ||
		strings.HasPrefix(s, "<system-reminder>") ||
		strings.HasPrefix(s, "<task-notification>") ||
		strings.HasPrefix(s, "Caveat:") ||
		strings.HasPrefix(s, "[Request interrupted") ||
		// Typed by agentdeck to open the model list.
		cleanUserText(s) == "/model"
}

var commandName = regexp.MustCompile(`(?s)<command-name>(.*?)</command-name>(?:.*?<command-args>(.*?)</command-args>)?`)

// Claude Code logs a bracketed paste wrapped in <pasted_content id="..."> tags.
var pastedTag = regexp.MustCompile(`[ \t]*</?pasted_content(?: id="[^"]*")?>[ \t]*\n?`)

func cleanUserText(s string) string {
	if m := commandName.FindStringSubmatch(s); m != nil {
		return strings.TrimSpace(m[1] + " " + m[2])
	}
	return strings.TrimSpace(pastedTag.ReplaceAllString(s, ""))
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
