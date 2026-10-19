// Package screen reads an agent's terminal screen for what its session log
// doesn't show: a menu waiting for an answer, or that it is working.
package screen

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

type Option struct {
	Number int    `json:"number"`
	Label  string `json:"label"`
}

type Prompt struct {
	Question string   `json:"question"`
	Context  []string `json:"context,omitempty"`
	Options  []Option `json:"options"`
	Selected int      `json:"selected"` // number of the option under the cursor
}

type State struct {
	Working bool
	Prompt  *Prompt
}

// The menu cursor, as Claude Code (❯) and Codex (›) draw it.
const cursors = "❯›▶"

var numbered = regexp.MustCompile(`^\d+[.)]\s+`)

// Claude Code's spinner while it works: "✻ Deciphering… (7m 4s · ↓ 12.3k tokens)".
// The footer's "esc to interrupt" is replaced by "· 1 shell" while a
// background shell runs, so the spinner is the steadier sign.
var spinner = regexp.MustCompile(`^\S\s+\S+…\s+\(\d`)

// Read looks at the screen lines, top to bottom.
func Read(lines []string) State {
	clean := make([]string, len(lines))
	var st State
	for i, l := range lines {
		clean[i] = strip(l)
		if strings.Contains(strings.ToLower(clean[i]), "to interrupt") || spinner.MatchString(strings.TrimSpace(clean[i])) {
			st.Working = true
		}
	}
	st.Prompt = findPrompt(clean)
	return st
}

// strip removes box-drawing borders, keeping the indent inside the box.
func strip(l string) string {
	t := strings.TrimLeft(l, " ")
	if r, size := utf8.DecodeRuneInString(t); strings.ContainsRune("│┃", r) {
		l = t[size:]
	}
	return strings.TrimRight(strings.TrimRight(strings.TrimRight(l, " "), "│┃╭╮╰╯─━"), " ")
}

func indent(l string) int {
	return utf8.RuneCountInString(l) - utf8.RuneCountInString(strings.TrimLeft(l, " "))
}

// cursorLine returns the option text and its column if the line starts with
// a menu cursor.
func cursorLine(l string) (string, int, bool) {
	t := strings.TrimLeft(l, " ")
	r, size := utf8.DecodeRuneInString(t)
	if !strings.ContainsRune(cursors, r) {
		return "", 0, false
	}
	rest := t[size:]
	text := strings.TrimLeft(rest, " ")
	if text == "" {
		return "", 0, false
	}
	col := indent(l) + 1 + utf8.RuneCountInString(rest) - utf8.RuneCountInString(text)
	return text, col, true
}

// findPrompt finds the lowest line with a menu cursor and the options
// aligned with it, above and below. The text above them is the question.
func findPrompt(lines []string) *Prompt {
	cur, col := -1, 0
	var first string
	for i := len(lines) - 1; i >= 0; i-- {
		if text, c, ok := cursorLine(lines[i]); ok {
			cur, col, first = i, c, text
			break
		}
	}
	if cur < 0 {
		return nil
	}
	isOption := func(l string) bool {
		return strings.TrimSpace(l) != "" && indent(l) == col
	}
	start, end := cur, cur
	for start > 0 && isOption(lines[start-1]) {
		start--
	}
	for end < len(lines)-1 && isOption(lines[end+1]) {
		end++
	}
	if end == start {
		return nil
	}
	p := &Prompt{Selected: cur - start + 1}
	for i := start; i <= end; i++ {
		label := first
		if i != cur {
			label = strings.TrimSpace(lines[i])
		}
		p.Options = append(p.Options, Option{Number: i - start + 1, Label: numbered.ReplaceAllString(label, "")})
	}
	// Up to six non-empty lines above the options, stopping at a double
	// gap: the closest is the question, the rest is context such as the
	// command to approve.
	var above []string
	for i := start - 1; i >= 0 && len(above) < 6; i-- {
		l := strings.TrimSpace(lines[i])
		if l == "" {
			if len(above) > 0 && i > 0 && strings.TrimSpace(lines[i-1]) == "" {
				break
			}
			continue
		}
		above = append([]string{l}, above...)
	}
	if len(above) == 0 {
		return nil
	}
	p.Question = above[len(above)-1]
	p.Context = above[:len(above)-1]
	return p
}
