import { useEffect, useRef } from "react";
import { Events } from "@wailsio/runtime";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Deck } from "@/lib/api";
import { OutputStream, fromBase64, stripReplies } from "@/lib/stream";

// The raw terminal of a running session: the PTY's output as is, and every
// key goes straight to the CLI.
export function TerminalView({ sessionId, visible }: { sessionId: string; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Geist Mono Variable", ui-monospace, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      theme: { background: "#141418", foreground: "#e6e6ea", cursor: "#6ee7b7", selectionBackground: "#3f3f4a" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {
      // The DOM renderer is fine without WebGL.
    }
    termRef.current = term;
    fitRef.current = fit;

    const stream = new OutputStream((b) => term.write(b));
    const off = Events.On("session:output", (ev) => {
      if (ev.data.id !== sessionId) return;
      stream.push({ start: ev.data.start, bytes: fromBase64(ev.data.data ?? "") });
    });
    Deck.Snapshot(sessionId)
      .then((s) => stream.snapshot(fromBase64(s.data ?? ""), s.end))
      .catch(() => stream.snapshot(new Uint8Array(), 0));

    const input = term.onData((d) => {
      const data = stripReplies(d);
      if (data) Deck.Input(sessionId, data).catch(() => {});
    });
    const resize = term.onResize(({ cols, rows }) => {
      Deck.Resize(sessionId, cols, rows).catch(() => {});
    });
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetParent) fit.fit();
    });
    observer.observe(host.current!);

    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      off();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!visible) return;
    fitRef.current?.fit();
    const t = termRef.current;
    if (t) {
      Deck.Resize(sessionId, t.cols, t.rows).catch(() => {});
      t.focus();
    }
  }, [visible, sessionId]);

  return <div ref={host} className="h-full w-full bg-[#141418] p-2 pr-0" />;
}
