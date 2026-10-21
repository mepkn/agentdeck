# agentdeck

A macOS app that gives the AI coding agent CLIs (Claude Code, Codex, Antigravity) a clean chat
view, with the real terminal one click away, and an Android app to follow and answer them from
your phone.

## Features

- Projects are folders; each has its sessions in the sidebar with a status dot: working,
  needs you, finished, idle or asleep.
- Each session is the agent's own CLI running in a real terminal. **Chat** shows it as messages
  and tool calls; **Terminal** (⌘J) is the raw CLI.
- Menus the agent waits on (approvals, "trust this folder?") appear as a card with buttons.
- Sleep stops the agent and keeps the session; Wake resumes it. Close removes it.
- The session bar opens the project in Finder, Terminal or Zed, or in
  [gitdeck](https://github.com/mepkn/gitdeck) (git client with VS Code-style diffs).
- Agents keep running with the window closed; the menu bar icon shows how many need you.
- Checks for updates on launch and from agentdeck → Check for Updates… in the menu bar;
  installs the latest GitHub release and restarts (running agents stop).
- **Phone**: pair the Android app by QR code (phone button in the sidebar). It lists the
  sessions, shows the chat, sends messages, answers menus, has quick keys (Esc, Ctrl-C, arrows,
  Enter, Tab, ⇧Tab) and starts, sleeps, wakes and closes sessions. A push says when an agent needs
  you or finishes; its text is generic ("Claude Code needs you").
- Phone and Mac talk end to end encrypted through a small relay; the relay can't read them.
- Single user: no sign-in. The Mac trusts phones it paired with; a pairing code works once, for
  5 minutes.

## Stack

Wails v3 · Go · React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Base UI) · xterm.js · Vitest ·
Expo · React Native · NativeWind · @noble (X25519, XChaCha20-Poly1305, Ed25519) · Expo push

## Development

Needs macOS, Go 1.25+, Node 22.18+ (`.nvmrc`), the Wails v3 CLI
(`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.30`) and at least one agent CLI
on the login shell's `PATH` (`claude`, `codex`, `agy`).

```bash
cd desktop/frontend && npm install && cd ..
wails3 dev            # app with hot reload
```

The Android app needs JDK 17 and the Android SDK (an emulator works; pair it with
`adb shell am start -a android.intent.action.VIEW -d '<pairing link>'`):

```bash
cd mobile && npm install
npx expo run:android  # build the dev client, install it and start Metro
```

Set `AGENTDECK_RELAY` (e.g. `ws://localhost:8090/relay`) to point the Mac at a local relay
(`cd relay && go run .`).

## Scripts

| Command | What it does |
|---|---|
| `scripts/check.sh` | Go vet + tests (relay, desktop), then typecheck, lint and tests of the desktop frontend and the mobile app |
| `wails3 dev` (in `desktop/`) | Run the app in development mode |
| `wails3 build` (in `desktop/`) | Build `desktop/bin/agentdeck` |
| `wails3 package` (in `desktop/`) | Build `desktop/bin/agentdeck.app` |
| `npm run icons` (in `desktop/frontend/`) | Render `build/appicon.png` and `build/tray.png` from the SVGs |
| `npm run icons` (in `mobile/`) | Render the Android icons into `mobile/assets/images/` |
| `scripts/build-android.sh <preview\|production> <cloud\|local>` | EAS build of the Android app |
| `scripts/deploy-relay.sh` | Deploy the relay to the VPS (`DRY_RUN=1` previews) |
| `go test -tags live -run Live ./hub/` (in `relay/`) | Check the deployed relay end to end |
| `AGENT=claude go test -tags smoke -run Smoke -v ./internal/sessions/` (in `desktop/`) | End-to-end run of a real agent (sends one short message) |

## Deployment

- **Relay**: `scripts/deploy-relay.sh` builds it in Docker on the VPS (`relay/compose.yaml`,
  `127.0.0.1:8092`) behind Caddy at `wss://agentdeck.pknspace.com/relay`. `relay/.env.prod.local`
  holds `DEPLOY_HOST`, `DEPLOY_PORT` and `RELAY_DIR` (see `relay/.env.example`).
- **Release**: `.github/workflows/release.yml` (run by hand: `gh workflow run release.yml`)
  builds the Android preview APK and the macOS app side by side and attaches both,
  `agentdeck.apk` and `agentdeck-macos.zip`, to one GitHub Release (tagged with the short commit SHA, marked latest), so
  `releases/latest/download/<file>` works for each. The Android build needs the `EXPO_TOKEN` repo secret (from
  `mobile/.eas-token`). Push uses Firebase project `agent-deck-de70d`: `mobile/google-services.json`
  is committed; its FCM service account key is uploaded to EAS, not to the repo.
- The macOS app is unsigned: first launch is right-click → Open.

## How it works

- `internal/sessions` starts the CLI in a PTY. Its output goes to the terminal view as is and
  into a terminal emulator (vt10x) that the backend reads.
- `internal/agents` has one adapter per agent: how to start and resume it, where its session log
  is (Claude Code: `~/.claude/projects/<dir>/<id>.jsonl`), and how to turn log lines into chat items.
- `internal/screen` reads the emulated screen for a menu cursor (❯ / ›) and for working: the
  spinner line ("✻ Deciphering… (12s · …)") or "esc to interrupt". Answering a menu moves the cursor and presses Enter.
- The chat box types into the PTY (bracketed paste for multi-line text), so chat and terminal are
  one session, and sessions stay resumable in the CLIs themselves.
- `internal/shellenv` loads the login shell's `PATH`, since apps opened from Finder lack it.
- State (projects, sessions) is in `~/Library/Application Support/agentdeck/state.json`.
- **Updates** (`desktop/update.go`): release builds carry their short commit SHA
  (`-X main.commit`, set in `desktop/build/darwin/Taskfile.yml`). On launch and from the menu, the
  app compares it with the tag of the latest GitHub release; if they differ it downloads
  `agentdeck-macos.zip` to a temp folder, quits, swaps the `.app` in place (putting the old one back
  if that fails), deletes the download and relaunches. The app's folder must be writable. A release
  made for an Android-only change also counts as an update. Builds without a SHA skip the check.
- **Phone link** (`desktop/internal/remote`, `mobile/src/lib/link.ts`): each device has an Ed25519
  key (its relay ID) and an X25519 key. The relay checks a signed challenge, then forwards opaque
  blobs between IDs and reports who is online. Messages are sealed with X25519 + HKDF-SHA256 +
  XChaCha20-Poly1305, with the sender and recipient IDs as associated data, and carry a timestamp;
  old or repeated ones are dropped. The QR code holds the relay URL, the Mac's keys and a one-time
  secret. The Mac connects to the relay only while a phone is paired or pairing.
- Phone keys are in the Android keystore (`expo-secure-store`); the Mac's and the paired phones
  are in `~/Library/Application Support/agentdeck/remote.json` (mode 600).
