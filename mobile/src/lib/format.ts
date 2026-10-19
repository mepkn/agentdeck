import type { Session as Info } from "@/lib/types";

export type Dot = "working" | "waiting" | "done" | "idle" | "asleep";

// What the sidebar dot shows: an unread finished session is "done".
export function dotFor(s: Info): Dot {
  if (s.status === "waiting") return "waiting";
  if (s.status === "working" || s.status === "starting") return "working";
  if (s.status === "asleep") return "asleep";
  return s.unread ? "done" : "idle";
}

export const statusLabel: Record<Dot, string> = {
  working: "Working",
  waiting: "Needs you",
  done: "Finished",
  idle: "Idle",
  asleep: "Asleep",
};

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// Newest first.
export function sortSessions(list: Info[]): Info[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function sessionTitle(s: Info): string {
  return s.title.trim() || "New session";
}
