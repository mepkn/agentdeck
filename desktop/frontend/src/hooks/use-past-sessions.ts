import { useEffect, useState } from "react";
import { Deck, type PastSession } from "@/lib/api";

// Every logged Claude Code session, reloaded when the window regains focus
// and every minute, with the time it was loaded.
export function usePastSessions() {
  const [past, setPast] = useState<PastSession[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Deck.PastSessions()
        .then((p) => {
          if (!alive) return;
          setPast(p ?? []);
          setLoadedAt(Date.now());
        })
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      clearInterval(t);
    };
  }, []);
  return { past, loadedAt };
}
