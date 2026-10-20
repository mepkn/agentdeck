import { useEffect, useState } from "react";
import { MessageSquareIcon, PlayIcon, SquareTerminalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatControls, ControlsToggle } from "@/components/ChatControls";
import { ChatView } from "@/components/ChatView";
import { Composer } from "@/components/Composer";
import { LazygitButton, OpenInButton } from "@/components/OpenIn";
import { PromptCard } from "@/components/PromptCard";
import { StatusDot } from "@/components/StatusDot";
import { TerminalView } from "@/components/TerminalView";
import { Deck, errorMessage, type AgentInfo, type Info, type Project } from "@/lib/api";
import { useStoredToggle } from "@/hooks/use-stored-toggle";
import { dotFor, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "chat" | "terminal";

export function SessionView({ session, project, agent }: { session: Info; project?: Project; agent?: AgentInfo }) {
  const agentName = agent?.name ?? session.agent;
  const [view, setView] = useState<View>("chat");
  const [controlsShown, toggleControls] = useStoredToggle("agentdeck.controlsShown", true);
  const [summary, toggleSummary] = useStoredToggle("agentdeck.summary", false);
  const asleep = session.status === "asleep";
  const working = session.status === "working" || session.status === "starting";
  const dot = dotFor(session);

  // ⌘J switches between chat and terminal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setView((v) => (v === "chat" ? "terminal" : "chat"));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function run(fn: () => Promise<unknown>, failed: string) {
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e, failed));
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="drag flex h-12 pt-1.5 shrink-0 items-center gap-3 border-b pr-4 pl-24 group-data-[sidebar=hidden]/app:pr-12">
        <StatusDot dot={dot} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{session.title || "New session"}</h1>
        </div>
        <span className="hidden truncate text-xs text-muted-foreground md:block">
          {agentName} · {project?.name} · {statusLabel[dot]}
        </span>
        {project && <OpenInButton projectId={project.id} />}
        {project && <LazygitButton projectId={project.id} />}
        <div className="no-drag flex rounded-lg bg-muted p-0.5">
          {(["chat", "terminal"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              title={`${v === "chat" ? "Chat" : "Terminal"} (⌘J)`}
              aria-label={v === "chat" ? "Chat" : "Terminal"}
              className={cn(
                "flex h-6 items-center rounded-md px-2 text-muted-foreground",
                view === v && "bg-background text-foreground shadow-sm",
              )}
            >
              {v === "chat" ? <MessageSquareIcon className="size-3.5" /> : <SquareTerminalIcon className="size-3.5" />}
            </button>
          ))}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", view !== "chat" && "invisible")}>
          <ChatView sessionId={session.id} working={working && !session.prompt} summary={summary} />
        </div>
        {!asleep && (
          <div className={cn("absolute inset-0", view !== "terminal" && "invisible")}>
            <TerminalView key={session.id} sessionId={session.id} visible={view === "terminal"} />
          </div>
        )}
        {asleep && view === "terminal" && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            The agent is asleep. Wake it to open its terminal.
          </div>
        )}
      </div>

      {view === "chat" && (
        <div className="mx-auto w-full max-w-3xl shrink-0 space-y-3 px-6 pt-1 pb-3">
          {session.prompt && !asleep && <PromptCard sessionId={session.id} prompt={session.prompt} />}
          {asleep ? (
            <div className="flex items-center justify-between rounded-xl border border-dashed p-3 pl-4 text-sm text-muted-foreground">
              Asleep. Wake to continue where it left off.
              <Button size="sm" onClick={() => run(() => Deck.Wake(session.id), "Could not wake the session.")}>
                <PlayIcon /> Wake
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {controlsShown && (
                <ChatControls session={session} agent={agent} summary={summary} onSummary={toggleSummary} />
              )}
              <Composer
                key={session.id}
                sessionId={session.id}
                working={working}
                actions={<ControlsToggle shown={controlsShown} onToggle={toggleControls} />}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
