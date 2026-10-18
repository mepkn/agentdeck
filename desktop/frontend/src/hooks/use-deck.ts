import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { Deck, type AgentInfo, type Info, type Project } from "@/lib/api";

// Projects, sessions and agents, kept current from backend events.
export function useDeck() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Record<string, Info>>({});
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reloadProjects = useCallback(async () => {
    setProjects((await Deck.Projects()) ?? []);
  }, []);

  useEffect(() => {
    const offChanged = Events.On("session:changed", (ev) => {
      const s = ev.data;
      setSessions((all) => ({ ...all, [s.id]: s }));
    });
    const offRemoved = Events.On("session:removed", (ev) => {
      setSessions((all) => {
        const { [ev.data]: _gone, ...rest } = all;
        return rest;
      });
    });
    Promise.all([Deck.Projects(), Deck.Sessions(), Deck.Agents()]).then(([p, s, a]) => {
      setProjects(p ?? []);
      setSessions(Object.fromEntries((s ?? []).map((x) => [x.id, x])));
      setAgents(a ?? []);
      setLoaded(true);
    });
    return () => {
      offChanged();
      offRemoved();
    };
  }, []);

  return { projects, sessions, agents, loaded, reloadProjects };
}
