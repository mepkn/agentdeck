import { useState } from "react";
import {
  ChevronRightIcon,
  FolderPlusIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PlayIcon,
  PlusIcon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react";
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
import { OpenInItems } from "@/components/OpenIn";
import { PhoneDialog } from "@/components/PhoneDialog";
import { StatusDot } from "@/components/StatusDot";
import { useRemoteStatus } from "@/hooks/use-remote-status";
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

export function Sidebar({
  projects,
  sessions,
  agents,
  selected,
  onSelect,
  onAddProject,
  onProjectRemoved,
  onHide,
}: Props) {
  const [removing, setRemoving] = useState<Project | null>(null);
  const [closing, setClosing] = useState<Info | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const remote = useRemoteStatus();
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

  async function run(fn: () => Promise<unknown>, failed: string) {
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e, failed));
    }
  }

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
    <aside className="flex h-full w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Drags the window. */}
      <div className="drag flex h-12 pt-1.5 shrink-0 items-center border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag"
          aria-label="Add project"
          title="Add project"
          onClick={onAddProject}
        >
          <FolderPlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag"
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={onHide}
        >
          <PanelRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag relative ml-auto"
          aria-label="Phone"
          title="Phone"
          onClick={() => setPhoneOpen(true)}
        >
          <SmartphoneIcon />
          {remote?.phones?.some((p) => p.online) && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500" />
          )}
        </Button>
      </div>
      <PhoneDialog open={phoneOpen} onOpenChange={setPhoneOpen} status={remote} />
      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-4">
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
                  <ChevronRightIcon
                    className={cn("size-3 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
                  />
                  <h2 className="truncate">{p.name}</h2>
                  {isCollapsed && list.length > 0 && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 tabular-nums",
                        waiting > 0 ? "text-status-waiting" : "invisible group-hover:visible",
                      )}
                    >
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
                  <DropdownMenuContent align="start" className="w-auto max-w-60">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="font-normal break-all">
                        {p.path.replace(/^\/Users\/[^/]+/, "~")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <OpenInItems projectId={p.id} />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(p)}>
                      Remove project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <ul className={cn("mt-0.5 space-y-px", isCollapsed && "hidden")}>
                {list.map((s) => (
                  <li key={s.id} className="group/row relative">
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
                      <span className="text-xs text-muted-foreground tabular-nums group-hover/row:invisible group-has-data-popup-open/row:invisible">
                        {timeAgo(s.updatedAt)}
                      </span>
                    </button>
                    {/* Session actions sit over the time on hover. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                            aria-label={`${s.title || "Session"} options`}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
                        {s.status === "asleep" ? (
                          <DropdownMenuItem onClick={() => run(() => Deck.Wake(s.id), "Could not wake the session.")}>
                            <PlayIcon /> Wake
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => run(() => Deck.Sleep(s.id), "Could not stop the agent.")}>
                            <MoonIcon /> Sleep
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setClosing(s)}>
                          <XIcon /> Close session
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(o) => !o && setClosing(null)}
        title="Close this session?"
        description="The agent is stopped and the session leaves agentdeck. Its history stays in the agent's own files."
        confirmLabel="Close"
        onConfirm={async () => {
          if (closing) await Deck.Close(closing.id);
        }}
      />
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
