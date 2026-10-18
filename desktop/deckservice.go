package main

import (
	"github.com/mepkn/agentdeck/desktop/internal/agents"
	"github.com/mepkn/agentdeck/desktop/internal/sessions"
	"github.com/mepkn/agentdeck/desktop/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// DeckService is what the frontend calls; its methods become TS bindings.
type DeckService struct {
	st *store.Store
	m  *sessions.Manager
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

func (d *DeckService) Wake(id string) error  { return d.m.Wake(id) }
func (d *DeckService) Sleep(id string) error { return d.m.Sleep(id) }
func (d *DeckService) Close(id string) error { return d.m.Close(id) }
func (d *DeckService) Focus(id string)       { d.m.Focus(id) }

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
