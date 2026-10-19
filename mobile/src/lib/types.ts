// Shapes the Mac sends, as in desktop/internal/{store,agents,sessions,screen}.

export type Project = { id: string; name: string; path: string };
export type Choice = { value: string; label: string };
export type AgentInfo = { id: string; name: string; installed: boolean };

export type Tool = { name: string; summary: string; input?: string; output?: string; isError?: boolean; done: boolean };
export type Item = {
  id: string;
  kind: "user" | "assistant" | "tool";
  text?: string;
  tool?: Tool | null;
  time?: string;
};

export type PromptOption = { number: number; label: string };
export type Prompt = { question: string; context?: string[] | null; options: PromptOption[] | null; selected: number };

export type Status = "asleep" | "starting" | "working" | "waiting" | "idle";

export type Session = {
  id: string;
  projectId: string;
  agent: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: Status;
  prompt: Prompt | null;
  unread: boolean;
};

export type State = { mac: string; projects: Project[]; agents: AgentInfo[]; sessions: Session[] };

export type Key = "esc" | "enter" | "up" | "down" | "tab" | "shift-tab" | "ctrl-c";

/** What a phone can ask the Mac; desktop/internal/remote's request. */
export type Request =
  | { op: "state" }
  | { op: "open"; id: string }
  | { op: "start"; projectId: string; agent: string }
  | { op: "send"; id: string; text: string }
  | { op: "key"; id: string; key: Key }
  | { op: "answer"; id: string; n: number }
  | { op: "wake" | "sleep" | "close"; id: string }
  | { op: "push"; token: string }
  | { op: "pair"; secret: string; name: string };

export type Event =
  | { ev: "session"; data: Session }
  | { ev: "removed"; data: string }
  | { ev: "items"; data: { id: string; items: Item[] | null } };
