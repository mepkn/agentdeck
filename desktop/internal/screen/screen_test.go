package screen

import (
	"strings"
	"testing"
)

func TestClaudePermission(t *testing.T) {
	s := `
╭──────────────────────────────────────────╮
│ Bash command                             │
│                                          │
│   rm -rf build                           │
│   Remove build output                    │
│                                          │
│ Do you want to proceed?                  │
│ ❯ 1. Yes                                 │
│   2. Yes, and don't ask again for rm     │
│   3. No, and tell Claude what to do (esc)│
╰──────────────────────────────────────────╯
`
	st := Read(strings.Split(s, "\n"))
	if st.Prompt == nil {
		t.Fatal("no prompt")
	}
	p := st.Prompt
	if p.Question != "Do you want to proceed?" || len(p.Options) != 3 || p.Options[1].Label != "Yes, and don't ask again for rm" {
		t.Errorf("prompt: %+v", p)
	}
	if p.Selected != 1 {
		t.Errorf("selected: %d", p.Selected)
	}
	if len(p.Context) != 3 || p.Context[1] != "rm -rf build" {
		t.Errorf("context: %q", p.Context)
	}
}

func TestWorkingNoPrompt(t *testing.T) {
	st := Read([]string{"✻ Thinking… (esc to interrupt)", "", "> ", "1. not a menu"})
	if !st.Working || st.Prompt != nil {
		t.Errorf("state: %+v", st)
	}
}

func TestWorkingSpinnerWithoutFooter(t *testing.T) {
	st := Read([]string{"✻ Deciphering… (7m 4s · ↓ 12.3k tokens)", "", "❯ ", "▸▸ auto mode on · 1 shell"})
	if !st.Working {
		t.Errorf("state: %+v", st)
	}
	done := Read([]string{"✻ Baked for 23s · done 4:41 PM · 1 shell still running", "", "❯ "})
	if done.Working {
		t.Errorf("done line read as working: %+v", done)
	}
}

func TestNumberedListInOutput(t *testing.T) {
	// A numbered list starting at 2 is not a menu.
	st := Read([]string{"Steps:", "2. build", "3. test"})
	if st.Prompt != nil {
		t.Errorf("prompt: %+v", st.Prompt)
	}
}

func TestListWithoutCursor(t *testing.T) {
	st := Read([]string{"Plan:", "1. build", "2. test"})
	if st.Prompt != nil {
		t.Errorf("prompt: %+v", st.Prompt)
	}
}

func TestUnnumberedMenu(t *testing.T) {
	s := `
 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel
`
	p := Read(strings.Split(s, "\n")).Prompt
	if p == nil {
		t.Fatal("no prompt")
	}
	if p.Question != "Security guide" || len(p.Options) != 2 || p.Options[1].Label != "Yes, I trust this folder" || p.Selected != 1 {
		t.Errorf("prompt: %+v", p)
	}
}

func TestCursorOnSecondOption(t *testing.T) {
	p := Read([]string{"Allow?", "  1. Yes", "› 2. No"}).Prompt
	if p == nil || p.Selected != 2 || p.Options[1].Label != "No" || p.Options[0].Label != "Yes" {
		t.Errorf("prompt: %+v", p)
	}
}

func TestInputLineIsNotAMenu(t *testing.T) {
	// The input box with a typed draft has a cursor but no options.
	st := Read([]string{"╭────╮", "│ ❯ fix the bug │", "╰────╯", "  ? for shortcuts"})
	if st.Prompt != nil {
		t.Errorf("prompt: %+v", st.Prompt)
	}
}
