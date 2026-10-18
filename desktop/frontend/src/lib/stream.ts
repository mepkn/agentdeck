// Joins the terminal snapshot with live output events. Each event carries
// its byte offset in the session's output, so chunks the snapshot already
// holds are dropped and overlaps are trimmed.
export type Chunk = { start: number; bytes: Uint8Array };

export class OutputStream {
  private end = -1;
  private pending: Chunk[] = [];
  private write: (bytes: Uint8Array) => void;

  constructor(write: (bytes: Uint8Array) => void) {
    this.write = write;
  }

  // Events that arrive before the snapshot wait for it.
  push(c: Chunk) {
    if (this.end < 0) this.pending.push(c);
    else this.apply(c);
  }

  snapshot(bytes: Uint8Array, end: number) {
    this.write(bytes);
    this.end = end;
    for (const c of this.pending) this.apply(c);
    this.pending = [];
  }

  private apply({ start, bytes }: Chunk) {
    const stop = start + bytes.length;
    if (stop <= this.end) return;
    this.write(start < this.end ? bytes.subarray(this.end - start) : bytes);
    this.end = stop;
  }
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// The backend's emulator already answers cursor-position and colour
// queries; xterm.js answering too would send the CLI a second reply.
// eslint-disable-next-line no-control-regex -- matching escape sequences is the point
const replies = /\x1b\[\d+;\d+R|\x1b\[0n|\x1b\](?:10|11|4;\d+);rgb:[^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripReplies(data: string): string {
  return data.replace(replies, "");
}
