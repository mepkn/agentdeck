package main

import (
	"errors"
	"net/url"
	"os"
	"os/exec"
	"strings"
)

// The apps a project folder can be opened in, each with the app names
// `open -a` may know it by; the first one installed is used.
var openApps = []struct {
	name  string
	names []string
}{
	{"Finder", []string{"Finder"}},
	{"Terminal", []string{"Terminal"}},
	{"Zed", []string{"Zed", "Zed Preview"}},
}

func installedApp(names []string) string {
	for _, n := range names {
		if exec.Command("open", "-Ra", n).Run() == nil {
			return n
		}
	}
	return ""
}

// OpenApps lists which of those apps are installed on this Mac.
func (d *DeckService) OpenApps() []string {
	var out []string
	for _, a := range openApps {
		if installedApp(a.names) != "" {
			out = append(out, a.name)
		}
	}
	return out
}

// OpenIn opens a project's folder in Finder, Terminal or Zed.
func (d *DeckService) OpenIn(projectID, app string) error {
	p, ok := d.st.Project(projectID)
	if !ok {
		return errors.New("project not found")
	}
	for _, a := range openApps {
		if a.name != app {
			continue
		}
		bin := installedApp(a.names)
		if bin == "" {
			return errors.New(app + " is not installed")
		}
		return exec.Command("open", "-a", bin, p.Path).Run()
	}
	return errors.New("unknown app: " + app)
}

// ErrNoLazygit tells the frontend to offer installing lazygit.
const ErrNoLazygit = "lazygit is not installed"

// An app launched from Finder gets a short PATH, so look in Homebrew's too.
func lookLazygit() string {
	if p, err := exec.LookPath("lazygit"); err == nil {
		return p
	}
	for _, p := range []string{"/opt/homebrew/bin/lazygit", "/usr/local/bin/lazygit"} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// OpenLazygit opens Terminal in a project's folder and runs lazygit there.
// With install set, it first runs `brew install lazygit` in that Terminal.
func (d *DeckService) OpenLazygit(projectID string, install bool) error {
	p, ok := d.st.Project(projectID)
	if !ok {
		return errors.New("project not found")
	}
	if installedApp([]string{"Terminal"}) == "" {
		return errors.New("Terminal is not installed")
	}
	run := "lazygit"
	if !install {
		if lookLazygit() == "" {
			return errors.New(ErrNoLazygit)
		}
	} else {
		run = "brew install lazygit && lazygit"
	}
	// A .command file opens in a new Terminal window without needing
	// permission to script Terminal.
	f, err := os.CreateTemp("", "agentdeck-lazygit-*.command")
	if err != nil {
		return err
	}
	script := "#!/bin/zsh -l\nrm -f \"$0\"\ncd " + shellQuote(p.Path) + " || exit 1\n" + run + "\n"
	if _, err := f.WriteString(script); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if err := os.Chmod(f.Name(), 0o700); err != nil {
		return err
	}
	return exec.Command("open", "-a", "Terminal", f.Name()).Run()
}

// ErrNoGitdeck tells the frontend to offer downloading gitdeck.
const ErrNoGitdeck = "gitdeck is not installed"

// OpenGitdeck opens a project in gitdeck, the companion git client, through
// its gitdeck://open link.
func (d *DeckService) OpenGitdeck(projectID string) error {
	p, ok := d.st.Project(projectID)
	if !ok {
		return errors.New("project not found")
	}
	if installedApp([]string{"Gitdeck"}) == "" {
		return errors.New(ErrNoGitdeck)
	}
	link := "gitdeck://open?" + url.Values{"path": {p.Path}}.Encode()
	return exec.Command("open", link).Run()
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
