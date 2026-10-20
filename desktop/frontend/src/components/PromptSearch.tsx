import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Deck, errorMessage, type PromptMatch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (sessionId: string) => void;
};

// Searches every prompt typed in past Claude Code sessions; Enter opens the
// session, adding it to agentdeck asleep if it isn't there yet.
export function PromptSearch({ open, onOpenChange, onOpened }: Props) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PromptMatch[]>([]);
  const results = query.trim() ? found : [];
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!query.trim()) return;
    let alive = true;
    const t = setTimeout(() => {
      Deck.SearchPrompts(query)
        .then((r) => {
          if (!alive) return;
          setFound(r ?? []);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function openMatch(m: PromptMatch) {
    try {
      const s = await Deck.OpenPast(m.agent, m.agentSessionId, m.dir, m.title, Date.parse(m.time));
      onOpenChange(false);
      onOpened(s.id);
    } catch (e) {
      toast.error(errorMessage(e, "Could not open the session."));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      openMatch(results[active]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-24 translate-y-0 gap-0 p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search prompts</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search every prompt you've sent…"
            aria-label="Search prompts"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul ref={listRef} className="max-h-96 overflow-y-auto p-1">
          {query.trim() && results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No prompts match.</li>
          )}
          {results.map((m, i) => (
            <li key={`${m.agentSessionId}:${m.time}`}>
              <button
                type="button"
                onClick={() => openMatch(m)}
                onMouseMove={() => setActive(i)}
                className={cn("w-full rounded-md px-3 py-2 text-left", i === active && "bg-muted")}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{m.dir.split("/").pop()}</span>
                  {m.title && <span className="truncate">· {m.title}</span>}
                  <span className="ml-auto shrink-0 tabular-nums">{timeAgo(Date.parse(m.time))}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm break-words">{m.text}</p>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
