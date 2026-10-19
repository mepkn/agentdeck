import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Browser, Events } from "@wailsio/runtime";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, ChevronRightIcon, LoaderIcon, XIcon } from "lucide-react";
import { Deck, type Item } from "@/lib/api";
import { cn } from "@/lib/utils";

// Summary mode leaves out tool calls, showing only the conversation.
export function ChatView({ sessionId, working, summary }: { sessionId: string; working: boolean; summary: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let alive = true;
    const off = Events.On("session:items", (ev) => {
      if (ev.data.id !== sessionId) return;
      setItems((all) => upsert(all, ev.data.items ?? []));
    });
    Deck.Items(sessionId).then((list) => {
      if (alive) setItems((all) => upsert(list ?? [], all));
    });
    return () => {
      alive = false;
      off();
    };
  }, [sessionId]);

  // Follow new items unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, working]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="h-full overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
        {items.length === 0 && !working && (
          <p className="py-16 text-center text-sm text-muted-foreground">Send a message to start.</p>
        )}
        {turns(items.filter((it) => !(summary && it.kind === "tool"))).map((turn) =>
          turn[0].kind === "user" ? (
            <UserBubble key={turn[0].id} item={turn[0]} />
          ) : (
            <AgentTurn key={turn[0].id} items={turn} />
          ),
        )}
        {working && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderIcon className="size-3.5 animate-spin" /> Working…
          </div>
        )}
      </div>
    </div>
  );
}

// Adds new items and replaces changed ones, keeping order of first sight.
function upsert(list: Item[], changed: Item[]): Item[] {
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

// Groups the agent's consecutive replies and tool calls into one turn, so each reply is one bubble.
function turns(items: Item[]): Item[][] {
  const out: Item[][] = [];
  for (const it of items) {
    const last = out.at(-1);
    if (it.kind !== "user" && last && last[0].kind !== "user") last.push(it);
    else out.push([it]);
  }
  return out;
}

function UserBubble({ item }: { item: Item }) {
  return (
    <div className="selectable ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm whitespace-pre-wrap">
      {item.text}
    </div>
  );
}

// Links open in the default browser, not inside the app's window.
const markdownParts: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void Browser.OpenURL(href);
      }}
    >
      {children}
    </a>
  ),
};

function AgentTurn({ items }: { items: Item[] }) {
  return (
    <div className="mr-auto flex w-fit max-w-[85%] flex-col gap-3 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5">
      {items.map((it) =>
        it.kind === "tool" && it.tool ? (
          <ToolRow key={it.id} item={it} />
        ) : (
          <div key={it.id} className="selectable prose-chat text-sm">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownParts}>{it.text ?? ""}</Markdown>
          </div>
        ),
      )}
    </div>
  );
}

function ToolRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const t = item.tool!;
  return (
    <div className="-my-2 text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground hover:text-foreground"
      >
        <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="shrink-0 font-medium text-foreground/80">{t.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{t.summary !== t.name && t.summary}</span>
        {!t.done ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
        ) : t.isError ? (
          <XIcon className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0 text-status-done" />
        )}
      </button>
      {open && (
        <div className="selectable mt-1 ml-5 space-y-2">
          {t.input && <Pre label="Input">{t.input}</Pre>}
          {t.output && <Pre label="Output">{t.output}</Pre>}
        </div>
      )}
    </div>
  );
}

function Pre({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <pre className="max-h-72 overflow-auto rounded-md bg-code p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}
