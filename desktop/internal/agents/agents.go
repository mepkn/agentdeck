// Package agents knows how to start each agent CLI and how to turn its
// session log into chat items. Each agent is one Adapter.
package agents

import (
	"os/exec"
	"sort"
)

// Item is one entry in the chat view. Items are upserted by ID: a tool call
// is sent again once its result arrives.
type Item struct {
	ID   string `json:"id"`
	Kind string `json:"kind"` // "user", "assistant" or "tool"
	Text string `json:"text,omitempty"`
	Tool *Tool  `json:"tool,omitempty"`
	Time string `json:"time,omitempty"`
}

type Tool struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Input   string `json:"input,omitempty"`
	Output  string `json:"output,omitempty"`
	IsError bool   `json:"isError,omitempty"`
	Done    bool   `json:"done"`
}

// Parser turns session log lines into items. It is fed complete lines in
// order and returns the items each line created or changed.
type Parser interface {
	Feed(line []byte) []Item
}

type Launch struct {
	Dir            string
	AgentSessionID string
	Resume         bool
}

type Adapter interface {
	ID() string
	Name() string
	Binary() string
	// NewSessionID returns the ID to start a new session with, or "" when the
	// CLI picks its own and FindSessionID must discover it.
	NewSessionID() string
	Args(l Launch) []string
	// LogPath is the session log for a session, or "" if not known yet.
	LogPath(dir, agentSessionID string) string
	NewParser() Parser
}

var registry = map[string]Adapter{}

func register(a Adapter) { registry[a.ID()] = a }

func Get(id string) (Adapter, bool) {
	a, ok := registry[id]
	return a, ok
}

type Info struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
}

func List() []Info {
	out := make([]Info, 0, len(registry))
	for _, a := range registry {
		_, err := exec.LookPath(a.Binary())
		out = append(out, Info{ID: a.ID(), Name: a.Name(), Installed: err == nil})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// truncate keeps s under n bytes, cutting on a rune boundary.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	r := []rune(s[:n])
	return string(r[:len(r)-1]) + "…"
}
