import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Identity } from "@/lib/crypto";
import { Link, LinkError, type LinkState } from "@/lib/link";
import { deviceName, pushToken } from "@/lib/notifications";
import type { Mac, PairCode } from "@/lib/pairing";
import { loadIdentity, loadMac, saveMac } from "@/lib/storage";
import type { Item, Request, Session, State } from "@/lib/types";

type ItemsListener = (items: Item[]) => void;

type Deck = {
  loaded: boolean;
  mac: Mac | null;
  link: LinkState;
  state: State | null;
  pair: (code: PairCode) => Promise<void>;
  unpair: () => Promise<void>;
  request: <T = unknown>(req: Request) => Promise<T>;
  refresh: () => Promise<void>;
  /** Opens a chat: returns its items, then streams changes to onItems until the returned function is called. */
  watch: (id: string, onItems: ItemsListener) => () => void;
};

const DeckContext = createContext<Deck | null>(null);

export function useDeck(): Deck {
  const d = useContext(DeckContext);
  if (!d) throw new Error("useDeck outside DeckProvider");
  return d;
}

export function useSession(id: string): Session | undefined {
  return useDeck().state?.sessions.find((s) => s.id === id);
}

const PAIR_WAIT = 15_000;

export function DeckProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [mac, setMac] = useState<Mac | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("offline");
  const [state, setState] = useState<State | null>(null);
  const link = useRef<Link | null>(null);
  // The chat that is open, so it can be reopened after a reconnect.
  const open = useRef<{ id: string; onItems: ItemsListener } | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    void Promise.all([loadIdentity(), loadMac()]).then(([id, m]) => {
      setIdentity(id);
      setMac(m);
      setLoaded(true);
    });
  }, []);

  const refresh = useCallback(async () => {
    const l = link.current;
    if (!l || l.state !== "online") return;
    try {
      setState(await l.request<State>({ op: "state" }));
      const o = open.current;
      if (o) o.onItems((await l.request<Item[] | null>({ op: "open", id: o.id })) ?? []);
    } catch {
      // Shown through the link state.
    }
  }, []);

  useEffect(() => {
    if (!identity || !mac) return;
    const l = new Link(
      identity,
      mac,
      (s) => {
        setLinkState(s);
        if (s !== "online") return;
        void refresh();
        if (!pushed.current) {
          pushed.current = true;
          void pushToken().then((token) => token && l.request({ op: "push", token }).catch(() => {}));
        }
      },
      (e) => {
        if (e.ev === "session") {
          setState((st) => st && { ...st, sessions: upsertSession(st.sessions, e.data) });
        } else if (e.ev === "removed") {
          setState((st) => st && { ...st, sessions: st.sessions.filter((s) => s.id !== e.data) });
        } else if (e.ev === "items" && open.current?.id === e.data.id) {
          open.current.onItems(e.data.items ?? []);
        }
      },
    );
    link.current = l;
    l.start();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        l.nudge();
        void refresh();
      }
    });
    return () => {
      sub.remove();
      l.stop();
      link.current = null;
      setLinkState("offline");
      setState(null);
    };
  }, [identity, mac, refresh]);

  const pair = useCallback(
    async (code: PairCode) => {
      if (!identity) throw new Error("Still loading.");
      const { secret, ...m } = code;
      const l = await new Promise<Link>((resolve, reject) => {
        const timer = setTimeout(() => {
          l.stop();
          reject(new LinkError(`Couldn't reach ${m.name}. Is agentdeck open on the Mac?`));
        }, PAIR_WAIT);
        const l = new Link(
          identity,
          m,
          (s) => {
            if (s !== "online") return;
            clearTimeout(timer);
            resolve(l);
          },
          () => {},
        );
        l.start();
      });
      try {
        await l.request({ op: "pair", secret, name: deviceName() });
      } finally {
        l.stop();
      }
      await saveMac(m);
      pushed.current = false;
      setMac(m);
    },
    [identity],
  );

  const unpair = useCallback(async () => {
    await saveMac(null);
    setMac(null);
  }, []);

  const request = useCallback(<T,>(req: Request): Promise<T> => {
    const l = link.current;
    if (!l) return Promise.reject(new LinkError("Not paired."));
    return l.request<T>(req);
  }, []);

  const watch = useCallback((id: string, onItems: ItemsListener) => {
    const entry = { id, onItems };
    open.current = entry;
    link.current
      ?.request<Item[] | null>({ op: "open", id })
      .then((items) => open.current === entry && onItems(items ?? []))
      .catch(() => {});
    return () => {
      if (open.current !== entry) return;
      open.current = null;
      link.current?.request({ op: "open", id: "" }).catch(() => {});
    };
  }, []);

  return (
    <DeckContext.Provider value={{ loaded, mac, link: linkState, state, pair, unpair, request, refresh, watch }}>
      {children}
    </DeckContext.Provider>
  );
}

function upsertSession(list: Session[], s: Session): Session[] {
  const i = list.findIndex((x) => x.id === s.id);
  if (i < 0) return [...list, s];
  const out = [...list];
  out[i] = s;
  return out;
}

/** Adds new items and replaces changed ones, keeping the order of first sight. */
export function upsertItems(list: Item[], changed: Item[]): Item[] {
  if (changed.length === 0) return list;
  const out = [...list];
  const index = new Map(out.map((it, i) => [it.id, i]));
  for (const it of changed) {
    const i = index.get(it.id);
    if (i === undefined) {
      index.set(it.id, out.length);
      out.push(it);
    } else out[i] = it;
  }
  return out;
}
