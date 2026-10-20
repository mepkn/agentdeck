package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/mepkn/agentdeck/desktop/internal/history"
	"github.com/mepkn/agentdeck/desktop/internal/remote"
	"github.com/mepkn/agentdeck/desktop/internal/sessions"
	"github.com/mepkn/agentdeck/desktop/internal/shellenv"
	"github.com/mepkn/agentdeck/desktop/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/tray.png
var trayIcon []byte

func init() {
	application.RegisterEvent[sessions.Info]("session:changed")
	application.RegisterEvent[string]("session:removed")
	application.RegisterEvent[sessions.ItemsEvent]("session:items")
	application.RegisterEvent[sessions.OutputEvent]("session:output")
	application.RegisterEvent[remote.Status]("remote:changed")
}

// emitter sends manager events to the frontend and paired phones, and keeps
// the tray current.
type emitter struct {
	app  *application.App
	tray *application.SystemTray
	m    *sessions.Manager
	r    *remote.Remote
	last int
}

func (e *emitter) SessionChanged(i sessions.Info) {
	e.app.Event.Emit("session:changed", i)
	if e.r != nil {
		e.r.SessionChanged(i)
	}
	e.updateTray()
}

func (e *emitter) SessionRemoved(id string) {
	e.app.Event.Emit("session:removed", id)
	if e.r != nil {
		e.r.SessionRemoved(id)
	}
	e.updateTray()
}

func (e *emitter) Items(ev sessions.ItemsEvent) {
	e.app.Event.Emit("session:items", ev)
	if e.r != nil {
		e.r.Items(ev)
	}
}

func (e *emitter) Output(ev sessions.OutputEvent) { e.app.Event.Emit("session:output", ev) }

func (e *emitter) updateTray() {
	if e.tray == nil || e.m == nil {
		return
	}
	n := e.m.Waiting()
	if n == e.last {
		return
	}
	e.last = n
	if n == 0 {
		e.tray.SetLabel("")
	} else {
		e.tray.SetLabel(fmt.Sprint(n))
	}
}

func main() {
	shellenv.Load()

	path, err := store.DefaultPath()
	if err != nil {
		log.Fatal(err)
	}
	st, err := store.Open(path)
	if err != nil {
		log.Fatal(err)
	}
	ev := &emitter{}
	m := sessions.New(st, ev)
	ev.m = m
	deck := &DeckService{st: st, m: m, h: history.New()}
	// Read the logs now so the first search is quick.
	go deck.h.Refresh()

	rpath, err := remote.DefaultPath()
	if err != nil {
		log.Fatal(err)
	}
	relay := os.Getenv("AGENTDECK_RELAY")
	if relay == "" {
		relay = remote.DefaultRelay
	}
	host, _ := os.Hostname()
	r, err := remote.New(rpath, relay, strings.TrimSuffix(host, ".local"), deck, func(s remote.Status) {
		if ev.app != nil {
			ev.app.Event.Emit("remote:changed", s)
		}
	})
	if err != nil {
		log.Fatal(err)
	}
	deck.r = r
	ev.r = r

	app := application.New(application.Options{
		Name:        "agentdeck",
		Description: "Chat and terminal views for AI coding agent CLIs",
		Services: []application.Service{
			application.NewService(deck),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			// Agents keep running with the window closed; quit from the tray.
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		OnShutdown: func() {
			r.Shutdown()
			m.Shutdown()
		},
	})
	ev.app = app

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "agentdeck",
		Width:     1200,
		Height:    780,
		MinWidth:  720,
		MinHeight: 480,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 40,
			Backdrop:                application.MacBackdropNormal,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(14, 14, 17),
		URL:              "/",
		EnableFileDrop:   true,
	})
	// The composer is the drop target; it adds the paths to the message.
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		app.Event.Emit("files:dropped", e.Context().DroppedFiles())
	})
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		window.Hide()
		e.Cancel()
	})
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) {
		window.Show()
		window.Focus()
	})

	menu := application.NewMenu()
	menu.Add("Open agentdeck").OnClick(func(*application.Context) {
		window.Show()
		window.Focus()
	})
	menu.AddSeparator()
	menu.Add("Quit (stops all agents)").OnClick(func(*application.Context) { app.Quit() })
	tray := app.SystemTray.New()
	tray.SetTemplateIcon(trayIcon)
	tray.SetTooltip("agentdeck")
	tray.SetMenu(menu)
	ev.tray = tray

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
