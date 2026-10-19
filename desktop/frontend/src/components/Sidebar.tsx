import { useState } from "react";
import { ChevronRightIcon, FolderPlusIcon, MoreHorizontalIcon, PanelLeftIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusDot } from "@/components/StatusDot";
import { Deck, errorMessage, type AgentInfo, type Info, type Project } from "@/lib/api";
import { dotFor, sortSessions, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "agentdeck:collapsed";

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

type Props = {
  projects: Project[];
  sessions: Info[];
  agents: AgentInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAddProject: () => void;
  onProjectRemoved: () => void;
  onHide: () => void;
};

export function Sidebar({ projects, sessions, agents, selected, onSelect, onAddProject, onProjectRemoved, onHide }: Props) {
  const [removing, setRemoving] = useState<Project | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  function toggle(id: string) {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // Not remembered this time; the sidebar still works.
    }
  }
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  async function start(projectId: string, agent: string) {
    try {
      const s = await Deck.Start(projectId, agent);
      if (collapsed.has(projectId)) toggle(projectId);
      onSelect(s.id);
    } catch (e) {
      toast.error(errorMessage(e, "Could not start the agent."));
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Room for the macOS traffic lights; drags the window. */}
      <div className="drag flex h-13 shrink-0 items-center justify-end px-2">
        <Button variant="ghost" size="icon-sm" className="no-drag" aria-label="Add project" title="Add project" onClick={onAddProject}>
          <FolderPlusIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="no-drag" aria-label="Hide sidebar" title="Hide sidebar" onClick={onHide}>
          <PanelLeftIcon />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {projects.length === 0 && (
          <p className="px-2 py-6 text-sm text-muted-foreground">Add a project folder to start an agent in it.</p>
        )}
        {projects.map((p) => {
          const list = sortSessions(sessions.filter((s) => s.projectId === p.id));
          const isCollapsed = collapsed.has(p.id);
          const waiting = list.filter((s) => s.status === "waiting").length;
          return (
            <section key={p.id} className="mt-3 first:mt-0">
              <div className="group flex h-7 items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-expanded={!isCollapsed}
                  title={p.path}
                  className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-md pl-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", !isCollapsed && "rotate-90")} />
                  <h2 className="truncate">{p.name}</h2>
                  {isCollapsed && list.length > 0 && (
                    <span className={cn("ml-auto shrink-0 tabular-nums", waiting > 0 && "text-status-waiting")}>
                      {waiting > 0 ? `${waiting} waiting` : list.length}
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                        aria-label={`New session in ${p.name}`}
                        title="New session"
                      />
                    }
                  >
                    <PlusIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>New session</DropdownMenuLabel>
                      {agents.map((a) => (
                        <DropdownMenuItem key={a.id} disabled={!a.installed} onClick={() => start(p.id, a.id)}>
                          {a.name}
                          {!a.installed && <span className="ml-auto text-xs text-muted-foreground">not installed</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
                        aria-label={`${p.name} options`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="max-w-64 truncate font-normal">{p.path}</DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(p)}>
                      Remove project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <ul className={cn("mt-0.5 space-y-px", isCollapsed && "hidden")}>
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      title={agentName(s.agent)}
                      className={cn(
                        "relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent/60",
                        selected === s.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      {/* Which agent runs it; the name is in the tooltip. */}
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
                        style={{ background: `var(--agent-${s.agent}, var(--muted-foreground))` }}
                      />
                      <StatusDot dot={dotFor(s)} />
                      <span className={cn("min-w-0 flex-1 truncate", s.unread && "font-medium")}>
                        {s.title || "New session"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(s.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="Its sessions are stopped and removed from agentdeck. The folder and the agents' own session history stay as they are."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          await Deck.RemoveProject(removing.id);
          onProjectRemoved();
        }}
      />
    </aside>
  );
}
