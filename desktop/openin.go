package main

import (
	"errors"
	"net/url"
	"os/exec"
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
