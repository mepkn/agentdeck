// Package history searches the prompts typed in past Claude Code sessions,
// read from the logs under ~/.claude/projects.
package history

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mepkn/agentdeck/desktop/internal/agents"
)

// Match is one prompt that matched a search.
type Match struct {
	Agent          string `json:"agent"`
	AgentSessionID string `json:"agentSessionId"`
	Dir            string `json:"dir"`
	Title          string `json:"title"`
	Text           string `json:"text"`
	Time           string `json:"time"`
}

type prompt struct {
	text, lower, time string
}

type file struct {
	mod     time.Time
	size    int64
	dir     string
	title   string
	prompts []prompt
}

type Index struct {
	mu    sync.Mutex
	root  string
	files map[string]*file
}

func New() *Index {
	home, _ := os.UserHomeDir()
	return &Index{root: filepath.Join(home, ".claude", "projects"), files: map[string]*file{}}
}

// Refresh re-reads the logs that changed since the last call.
func (x *Index) Refresh() {
	x.mu.Lock()
	defer x.mu.Unlock()
	paths, _ := filepath.Glob(filepath.Join(x.root, "*", "*.jsonl"))
	seen := make(map[string]bool, len(paths))
	for _, p := range paths {
		seen[p] = true
		fi, err := os.Stat(p)
		if err != nil {
			continue
		}
		if f, ok := x.files[p]; ok && f.mod.Equal(fi.ModTime()) && f.size == fi.Size() {
			continue
		}
		if f, err := readLog(p); err == nil {
			f.mod, f.size = fi.ModTime(), fi.Size()
			x.files[p] = f
		}
	}
	for p := range x.files {
		if !seen[p] {
			delete(x.files, p)
		}
	}
}

// Session is one logged session.
type Session struct {
	Agent          string `json:"agent"`
	AgentSessionID string `json:"agentSessionId"`
	Dir            string `json:"dir"`
	Title          string `json:"title"`
	UpdatedAt      int64  `json:"updatedAt"` // ms, the log's last write
}

// Sessions lists every logged session with at least one prompt, newest first.
func (x *Index) Sessions() []Session {
	x.Refresh()
	x.mu.Lock()
	defer x.mu.Unlock()
	out := []Session{}
	for p, f := range x.files {
		if len(f.prompts) == 0 || f.dir == "" {
			continue
		}
		title := f.title
		if title == "" {
			title = snippet(f.prompts[0].text, f.prompts[0].lower, "")
			if r := []rune(title); len(r) > 80 {
				title = string(r[:80]) + "…"
			}
		}
		out = append(out, Session{
			Agent: "claude", AgentSessionID: strings.TrimSuffix(filepath.Base(p), ".jsonl"),
			Dir: f.dir, Title: title, UpdatedAt: f.mod.UnixMilli(),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out
}

// Search returns up to limit prompts holding every word of query, newest first.
func (x *Index) Search(query string, limit int) []Match {
	words := strings.Fields(strings.ToLower(query))
	if len(words) == 0 {
		return []Match{}
	}
	x.Refresh()
	x.mu.Lock()
	defer x.mu.Unlock()
	out := []Match{}
	for p, f := range x.files {
		id := strings.TrimSuffix(filepath.Base(p), ".jsonl")
		for _, pr := range f.prompts {
			if containsAll(pr.lower, words) {
				out = append(out, Match{
					Agent: "claude", AgentSessionID: id, Dir: f.dir, Title: f.title,
					Text: snippet(pr.text, pr.lower, words[0]), Time: pr.time,
				})
			}
		}
	}
	// RFC 3339 times in UTC sort as strings.
	sort.Slice(out, func(i, j int) bool { return out[i].Time > out[j].Time })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func containsAll(s string, words []string) bool {
	for _, w := range words {
		if !strings.Contains(s, w) {
			return false
		}
	}
	return true
}

// snippet cuts a long prompt down to the part around the first match.
func snippet(text, lower, word string) string {
	const before, size = 60, 240
	text = strings.Join(strings.Fields(text), " ")
	lower = strings.Join(strings.Fields(lower), " ")
	r := []rune(text)
	if len(r) <= size {
		return text
	}
	start := 0
	if i := strings.Index(lower, word); i > 0 {
		start = len([]rune(lower[:i])) - before
	}
	start = max(0, min(start, len(r)-size))
	s := string(r[start : start+size])
	if start > 0 {
		s = "…" + s
	}
	if start+size < len(r) {
		s += "…"
	}
	return s
}

type logLine struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Cwd       string `json:"cwd"`
}

func readLog(path string) (*file, error) {
	fh, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer fh.Close()
	f := &file{}
	parser := agents.NewClaudeParser()
	r := bufio.NewReaderSize(fh, 1<<16)
	for {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			f.read(parser, line)
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
	}
	if t, ok := parser.(agents.TitleParser); ok {
		f.title = t.Title()
	}
	return f, nil
}

var (
	userType  = []byte(`"type":"user"`)
	titleType = []byte(`-title"`)
	toolRes   = []byte(`"tool_result"`)
)

func (f *file) read(parser agents.Parser, line []byte) {
	// Most of a log is replies and tool output; only typed prompts and
	// title lines need decoding.
	if bytes.Contains(line, titleType) && !bytes.Contains(line, userType) {
		parser.Feed(line)
		return
	}
	if !bytes.Contains(line, userType) || bytes.Contains(line, toolRes) {
		return
	}
	var l logLine
	if json.Unmarshal(line, &l) != nil || l.Type != "user" {
		return
	}
	if f.dir == "" {
		f.dir = l.Cwd
	}
	for _, it := range parser.Feed(line) {
		if it.Kind == "user" && it.Text != "" {
			f.prompts = append(f.prompts, prompt{text: it.Text, lower: strings.ToLower(it.Text), time: l.Timestamp})
		}
	}
}
