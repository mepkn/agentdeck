import { useEffect, useState } from "react";
import { Deck, type Usage } from "@/lib/api";

// The Claude account's plan limits, refreshed every two minutes while shown.
export function useClaudeUsage(enabled: boolean) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      Deck.ClaudeUsage()
        .then((u) => alive && setUsage(u))
        .catch(() => alive && setUsage(null));
    load();
    const timer = setInterval(load, 2 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return enabled ? usage : null;
}
