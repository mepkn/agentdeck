module github.com/mepkn/agentdeck/desktop

go 1.26.0

require (
	github.com/creack/pty v1.1.24
	github.com/google/uuid v1.6.0
	github.com/hinshun/vt10x v0.0.0-20220301184237-5011da428d02
	github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e
	github.com/wailsapp/wails/v3 v3.0.0-beta.30
)

require (
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/coder/websocket v1.8.14
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mepkn/agentdeck/relay v0.0.0
	golang.org/x/crypto v0.58.0
	golang.org/x/sys v0.49.0 // indirect
)

replace github.com/mepkn/agentdeck/relay => ../relay
