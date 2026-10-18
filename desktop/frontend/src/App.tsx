import { useEffect, useState } from "react";
import { FolderPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { SessionView } from "@/components/SessionView";
import { Sidebar } from "@/components/Sidebar";
import { useDeck } from "@/hooks/use-deck";
import { Deck, errorMessage } from "@/lib/api";

export default function App() {
  const { projects, sessions, agents, loaded, reloadProjects } = useDeck();
  const [selected, setSelected] = useState<string | null>(null);
  const session = selected ? sessions[selected] : undefined;

  // Tell the backend what is on screen, so it doesn't mark it unread.
  useEffect(() => {
    const report = () => Deck.Focus(document.visibilityState === "visible" && session ? session.id : "");
    report();
    document.addEventListener("visibilitychange", report);
    return () => document.removeEventListener("visibilitychange", report);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addProject() {
    try {
      const p = await Deck.PickFolder();
      if (p.id) await reloadProjects();
    } catch (e) {
      toast.error(errorMessage(e, "Could not add the folder."));
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar
        projects={projects}
        sessions={Object.values(sessions)}
        agents={agents}
        selected={session ? selected : null}
        onSelect={setSelected}
        onAddProject={addProject}
        onProjectRemoved={reloadProjects}
      />
      {session ? (
        <SessionView
          key={session.id}
          session={session}
          project={projects.find((p) => p.id === session.projectId)}
          agent={agents.find((a) => a.id === session.agent)}
        />
      ) : (
        <main className="flex flex-1 flex-col">
          <div className="drag h-11 shrink-0" />
          {loaded && (
            <div className="grid flex-1 place-items-center p-8 text-center">
              {projects.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Add a project folder to run agents in it.</p>
                  <Button onClick={addProject}>
                    <FolderPlusIcon /> Add project
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick a session, or press <span className="text-foreground">+</span> next to a project to start one.
                </p>
              )}
            </div>
          )}
        </main>
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
