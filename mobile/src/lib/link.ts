import { open, relayId, seal, signChallenge, type Identity } from "@/lib/crypto";
import type { Mac } from "@/lib/pairing";
import type { Event, Request } from "@/lib/types";

// One connection to the relay, talking end to end with one Mac. Mirrors
// desktop/internal/remote/client.go: challenge, signed hello, then frames.

type Frame = {
  t: string;
  nonce?: string;
  id?: string;
  sig?: string;
  to?: string;
  from?: string;
  data?: string;
  ids?: string[];
  online?: boolean;
  error?: string;
};

/** offline: no relay connection; away: relay up, Mac not connected; online: Mac reachable. */
export type LinkState = "offline" | "away" | "online";

const TIMEOUT = 20_000;
const MAX_AGE = 10 * 60_000;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class LinkError extends Error {}

export class Link {
  private ws: WebSocket | null = null;
  private ready = false;
  private rid = 0;
  private pending = new Map<number, Pending>();
  private seen = new Map<string, number>();
  private wait = 1000;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  readonly me: string;
  state: LinkState = "offline";

  constructor(
    private id: Identity,
    private mac: Mac,
    private onState: (s: LinkState) => void,
    private onEvent: (e: Event) => void,
  ) {
    this.me = relayId(id);
  }

  start() {
    this.stopped = false;
    if (!this.ws) this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.drop();
  }

  /** Reconnects now instead of waiting out the backoff, e.g. when the app comes back to the foreground. */
  nudge() {
    if (this.stopped) return;
    if (this.ws) {
      // A socket that sat in the background may be dead without knowing it.
      this.send({ t: "ping" });
      return;
    }
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.wait = 1000;
    this.connect();
  }

  request<T = unknown>(req: Request): Promise<T> {
    if (!this.ready) return Promise.reject(new LinkError("Not connected to the relay."));
    if (this.state !== "online" && req.op !== "pair")
      return Promise.reject(new LinkError(`${this.mac.name} is offline.`));
    const rid = ++this.rid;
    const body = JSON.stringify({ ...req, rid, ts: Date.now() });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new LinkError(`${this.mac.name} didn't answer.`));
      }, TIMEOUT);
      this.pending.set(rid, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ t: "send", to: this.mac.id, data: seal(this.id, this.mac.box, this.me, this.mac.id, body) });
    });
  }

  private connect() {
    const ws = new WebSocket(this.mac.relay);
    this.ws = ws;
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let f: Frame;
      try {
        f = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.frame(f);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.drop();
      if (this.stopped) return;
      this.retry = setTimeout(() => {
        this.retry = null;
        this.connect();
      }, this.wait);
      this.wait = Math.min(this.wait * 2, 30_000);
    };
    ws.onerror = () => ws.close();
  }

  private drop() {
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    ws?.close();
    this.failAll("Connection lost.");
    this.setState("offline");
  }

  private send(f: Frame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(f));
  }

  private setState(s: LinkState) {
    if (s === this.state) return;
    this.state = s;
    this.onState(s);
  }

  private failAll(msg: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new LinkError(msg));
    }
    this.pending.clear();
  }

  private frame(f: Frame) {
    switch (f.t) {
      case "challenge":
        this.send({ t: "hello", id: this.me, sig: signChallenge(this.id, f.nonce ?? "") });
        break;
      case "ready":
        this.ready = true;
        this.wait = 1000;
        this.setState("away");
        this.send({ t: "watch", ids: [this.mac.id] });
        this.ping = setInterval(() => this.send({ t: "ping" }), 25_000);
        break;
      case "presence":
        if (f.id !== this.mac.id) break;
        if (!f.online) this.failAll(`${this.mac.name} went offline.`);
        this.setState(f.online ? "online" : "away");
        break;
      case "offline":
        if (f.id !== this.mac.id) break;
        this.failAll(`${this.mac.name} is offline.`);
        this.setState("away");
        break;
      case "msg":
        if (f.from === this.mac.id && f.data) this.message(f.data);
        break;
    }
  }

  private message(data: string) {
    let m: { rid?: number; ev?: Event["ev"]; ts: number; error?: string; data?: unknown };
    try {
      const { nonce, plain } = open(this.id, this.mac.box, this.mac.id, this.me, data);
      m = JSON.parse(plain);
      const now = Date.now();
      for (const [n, t] of this.seen) if (now - t > MAX_AGE) this.seen.delete(n);
      if (this.seen.has(nonce) || Math.abs(now - m.ts) > MAX_AGE) return;
      this.seen.set(nonce, now);
    } catch {
      return;
    }
    if (m.rid) {
      const p = this.pending.get(m.rid);
      if (!p) return;
      this.pending.delete(m.rid);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.data);
    } else if (m.ev) {
      this.onEvent({ ev: m.ev, data: m.data } as Event);
    }
  }
}
