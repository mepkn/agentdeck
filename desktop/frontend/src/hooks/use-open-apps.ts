import { useEffect, useState } from "react";
import { Deck } from "@/lib/api";

let cached: Promise<string[]> | null = null;

// Which of Finder, Terminal and Zed are installed; looked up once per launch.
export function useOpenApps() {
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    cached ??= Deck.OpenApps().then((a) => a ?? []);
    cached.then((a) => alive && setApps(a)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return apps;
}
