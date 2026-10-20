package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"

	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/history"
	"github.com/mepkn/agentdeck/desktop/internal/remote"
	"github.com/mepkn/agentdeck/desktop/internal/sessions"
	"github.com/mepkn/agentdeck/desktop/internal/store"
	"github.com/skip2/go-qrcode"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// DeckService is what the frontend calls; its methods become TS bindings.
type DeckService struct {
	st *store.Store
	m  *sessions.Manager
	r  *remote.Remote
	h  *history.Index
}

func (d *DeckService) Agents() []agents.Info { return agents.List() }

func (d *DeckService) Projects() []store.Project { return d.st.Projects() }

// PickFolder asks for a folder and adds it as a project. An empty ID means
// the dialog was cancelled.
func (d *DeckService) PickFolder() (store.Project, error) {
	path, err := application.Get().Dialog.OpenFile().
		SetTitle("Add project").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil || path == "" {
		return store.Project{}, err
	}
	return d.m.AddProject(path)
}

func (d *DeckService) RemoveProject(id string) error { return d.m.RemoveProject(id) }

func (d *DeckService) Sessions() []sessions.Info { return d.m.List() }

func (d *DeckService) Start(projectID, agent string) (sessions.Info, error) {
	return d.m.Start(projectID, agent)
}

// ErrActiveElsewhere tells the frontend to ask before waking anyway.
const ErrActiveElsewhere = "this session is in use somewhere else"

// Wake resumes a sleeping session, unless it looks open in another terminal.
func (d *DeckService) Wake(id string) error {
	if d.m.ActiveElsewhere(id) {
		return errors.New(ErrActiveElsewhere)
	}
	return d.m.Wake(id)
}

// WakeAnyway resumes a session even if it looks open somewhere else.
func (d *DeckService) WakeAnyway(id string) error { return d.m.Wake(id) }
func (d *DeckService) Sleep(id string) error      { return d.m.Sleep(id) }
func (d *DeckService) Close(id string) error      { return d.m.Close(id) }
func (d *DeckService) Focus(id string)            { d.m.Focus(id) }

func (d *DeckService) Items(id string) ([]agents.Item, error) { return d.m.Items(id) }

func (d *DeckService) Send(id, text string) error      { return d.m.Send(id, text) }
func (d *DeckService) SetModel(id, model string) error { return d.m.SetModel(id, model) }
func (d *DeckService) SetEffort(id, effort string) error {
	return d.m.SetEffort(id, effort)
}
func (d *DeckService) SetMode(id, mode string) error { return d.m.SetMode(id, mode) }
func (d *DeckService) Key(id, key string) error      { return d.m.Key(id, key) }
func (d *DeckService) Answer(id string, n int) error { return d.m.Answer(id, n) }
func (d *DeckService) Input(id, data string) error   { return d.m.Input(id, data) }
func (d *DeckService) Resize(id string, cols, rows int) error {
	return d.m.Resize(id, cols, rows)
}

func (d *DeckService) Snapshot(id string) (sessions.Snapshot, error) { return d.m.Snapshot(id) }

// ClaudeUsage returns the Claude account's 5-hour and weekly limits.
func (d *DeckService) ClaudeUsage() (agents.Usage, error) { return agents.ClaudeUsage() }

func (d *DeckService) RemoteStatus() remote.Status { return d.r.Status() }

// PairPhone starts pairing and returns the QR code to scan, as a PNG data URL.
func (d *DeckService) PairPhone() (string, error) {
	p := d.r.StartPairing()
	b, _ := json.Marshal(p)
	png, err := qrcode.Encode("agentdeck://pair?d="+base64.RawURLEncoding.EncodeToString(b), qrcode.Medium, 512)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}

func (d *DeckService) StopPairing()                { d.r.StopPairing() }
func (d *DeckService) RemovePhone(id string) error { return d.r.RemovePhone(id) }

// SearchPrompts finds prompts typed in past Claude Code sessions.
func (d *DeckService) SearchPrompts(query string) []history.Match { return d.h.Search(query, 100) }

// PastSessions lists every logged Claude Code session, newest first.
func (d *DeckService) PastSessions() []history.Session { return d.h.Sessions() }

// OpenPast adds a logged session to agentdeck, asleep, or returns the one
// already there.
func (d *DeckService) OpenPast(agent, agentSessionID, dir, title string, updatedAt int64) (sessions.Info, error) {
	return d.m.OpenPast(agent, agentSessionID, dir, title, updatedAt)
}
