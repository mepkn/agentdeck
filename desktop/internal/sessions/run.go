package sessions

import (
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/hinshun/vt10x"
)

// Raw output kept for a terminal view opened later.
const scrollback = 2 << 20

// run is one running CLI process in a PTY.
type run struct {
	cmd     *exec.Cmd
	pty     *os.File
	vt      vt10x.Terminal
	started time.Time
	done    chan struct{}

	mu    sync.Mutex
	buf   []byte
	end   int64 // bytes of output so far
	dirty bool
	cols  int
	rows  int
	// While held, the terminal view's size waits here.
	held     bool
	wantCols int
	wantRows int
	onOutput func(start int64, data []byte)
}

func startRun(bin string, args []string, dir string) (*run, error) {
	path, err := exec.LookPath(bin)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(path, args...)
	cmd.Dir = dir
	cmd.Env = childEnv()
	r := &run{cmd: cmd, started: time.Now(), done: make(chan struct{}), cols: 100, rows: 30}
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(r.cols), Rows: uint16(r.rows)})
	if err != nil {
		return nil, err
	}
	r.pty = f
	// The emulator answers cursor-position queries, so a CLI that asks
	// (Codex does at start) gets a reply even with no terminal view open.
	r.vt = vt10x.New(vt10x.WithSize(r.cols, r.rows), vt10x.WithWriter(replyWriter{f}))
	go func() {
		_ = cmd.Wait()
		close(r.done)
	}()
	return r, nil
}

// childEnv is the app's env for a terminal, minus Claude Code's own markers
// in case agentdeck itself was started from a Claude Code session.
func childEnv() []string {
	var env []string
	for _, kv := range os.Environ() {
		if strings.HasPrefix(kv, "CLAUDECODE=") || strings.HasPrefix(kv, "CLAUDE_CODE_") ||
			strings.HasPrefix(kv, "TERM=") || strings.HasPrefix(kv, "COLORTERM=") {
			continue
		}
		env = append(env, kv)
	}
	return append(env, "TERM=xterm-256color", "COLORTERM=truecolor", "TERM_PROGRAM=agentdeck")
}

type replyWriter struct{ f *os.File }

// Write runs in the read loop with the emulator locked, so it must not block.
func (w replyWriter) Write(b []byte) (int, error) {
	c := append([]byte(nil), b...)
	go w.f.Write(c)
	return len(b), nil
}

func (r *run) readLoop() {
	defer r.pty.Close()
	b := make([]byte, 32<<10)
	for {
		n, err := r.pty.Read(b)
		if n > 0 {
			data := append([]byte(nil), b[:n]...)
			_, _ = r.vt.Write(data)
			r.mu.Lock()
			start := r.end
			r.end += int64(n)
			r.buf = append(r.buf, data...)
			if len(r.buf) > scrollback {
				r.buf = append([]byte(nil), r.buf[len(r.buf)-scrollback:]...)
			}
			r.dirty = true
			cb := r.onOutput
			r.mu.Unlock()
			if cb != nil {
				cb(start, data)
			}
		}
		if err != nil {
			return
		}
	}
}

// screen returns the visible lines and whether output came since last time.
func (r *run) screen() ([]string, bool) {
	r.mu.Lock()
	dirty := r.dirty
	r.dirty = false
	r.mu.Unlock()
	return r.lines(), dirty
}

// lines reads the screen without touching the dirty flag the watcher uses.
func (r *run) lines() []string {
	r.vt.Lock()
	defer r.vt.Unlock()
	cols, rows := r.vt.Size()
	lines := make([]string, rows)
	var sb strings.Builder
	for y := 0; y < rows; y++ {
		sb.Reset()
		for x := 0; x < cols; x++ {
			c := r.vt.Cell(x, y).Char
			if c == 0 {
				c = ' '
			}
			sb.WriteRune(c)
		}
		lines[y] = strings.TrimRight(sb.String(), " ")
	}
	return lines
}

func (r *run) write(s string) error {
	_, err := r.pty.Write([]byte(s))
	return err
}

func (r *run) resize(cols, rows int) error {
	if cols < 20 || rows < 5 {
		return nil
	}
	r.mu.Lock()
	if r.held {
		r.wantCols, r.wantRows = cols, rows
		r.mu.Unlock()
		return nil
	}
	r.mu.Unlock()
	return r.setSize(cols, rows)
}

// atLeast makes the terminal at least rows tall until release is called,
// for driving a menu that a short terminal would cut off.
func (r *run) atLeast(rows int) (release func()) {
	r.mu.Lock()
	cols, was := r.cols, r.rows
	r.held, r.wantCols, r.wantRows = true, cols, was
	r.mu.Unlock()
	if was < rows {
		_ = r.setSize(cols, rows)
		time.Sleep(300 * time.Millisecond) // let the CLI redraw
	}
	return func() {
		r.mu.Lock()
		r.held = false
		c, h := r.wantCols, r.wantRows
		r.mu.Unlock()
		_ = r.setSize(c, h)
	}
}

func (r *run) setSize(cols, rows int) error {
	r.mu.Lock()
	same := cols == r.cols && rows == r.rows
	r.cols, r.rows = cols, rows
	r.mu.Unlock()
	if same {
		return nil
	}
	r.vt.Resize(cols, rows)
	return pty.Setsize(r.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (r *run) snapshot() Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()
	return Snapshot{Data: append([]byte(nil), r.buf...), End: r.end, Cols: r.cols, Rows: r.rows}
}

// stop sends SIGTERM to the process group, then SIGKILL after 3s.
func (r *run) stop() {
	pid := r.cmd.Process.Pid
	_ = syscall.Kill(-pid, syscall.SIGTERM)
	select {
	case <-r.done:
	case <-time.After(3 * time.Second):
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		<-r.done
	}
	_ = r.pty.Close()
}
