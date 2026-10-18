# agentdeck

A desktop app (and later an Android app) that gives the AI coding agent CLIs (Claude Code,
Codex, Antigravity) a clean chat view, with the real terminal one click away.

## Features

- Projects are folders; each has its sessions in the sidebar with a status dot: working,
  needs you, finished, idle or asleep.
- Each session is the agent's own CLI running in a real terminal. **Chat** shows it as messages
  and tool calls; **Terminal** (⌘J) is the raw CLI.
- Menus the agent waits on (approvals, "trust this folder?") appear as a card with buttons.
- Sleep stops the agent and keeps the session; Wake resumes it. Close removes it.
- Agents keep running with the window closed; the menu bar icon shows how many need you.
- Single user, local: no sign-in.

## Stack

Wails v3 · Go · React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Base UI) · xterm.js · Vitest

## Development

Needs macOS, Go 1.25+, Node 22.18+ (`.nvmrc`), the Wails v3 CLI
(`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.30`) and at least one agent CLI
on the login shell's `PATH` (`claude`, `codex`, `agy`).

```bash
cd desktop/frontend && npm install && cd ..
wails3 dev            # app with hot reload
```

## Scripts

| Command | What it does |
|---|---|
| `scripts/check.sh` | Go vet + tests, frontend typecheck, lint and tests |
| `wails3 dev` (in `desktop/`) | Run the app in development mode |
| `wails3 build` (in `desktop/`) | Build `desktop/bin/agentdeck` |
| `wails3 package` (in `desktop/`) | Build `desktop/bin/agentdeck.app` |
| `npm run icons` (in `desktop/frontend/`) | Render `build/appicon.png` and `build/tray.png` from the SVGs |
| `AGENT=claude go test -tags smoke -run Smoke -v ./internal/sessions/` (in `desktop/`) | End-to-end run of a real agent (sends one short message) |

## Deployment

Not yet. The relay (`relay/`, on the VPS at `agentdeck.pknspace.com`) and the Android app
(`mobile/`) come next.

## How it works

- `internal/sessions` starts the CLI in a PTY. Its output goes to the terminal view as is and
  into a terminal emulator (vt10x) that the backend reads.
- `internal/agents` has one adapter per agent: how to start and resume it, where its session log
  is (Claude Code: `~/.claude/projects/<dir>/<id>.jsonl`), and how to turn log lines into chat items.
- `internal/screen` reads the emulated screen for a menu cursor (❯ / ›) and "esc to interrupt"
  (working). Answering a menu moves the cursor and presses Enter.
- The chat box types into the PTY (bracketed paste for multi-line text), so chat and terminal are
  one session, and sessions stay resumable in the CLIs themselves.
- `internal/shellenv` loads the login shell's `PATH`, since apps opened from Finder lack it.
- State (projects, sessions) is in `~/Library/Application Support/agentdeck/state.json`.
