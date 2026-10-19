import { useEffect, useState } from "react";
import { FolderPlusIcon, PanelRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { SessionView } from "@/components/SessionView";
import { Sidebar } from "@/components/Sidebar";
import { useDeck } from "@/hooks/use-deck";
import { useStoredToggle } from "@/hooks/use-stored-toggle";
import { Deck, errorMessage } from "@/lib/api";

export default function App() {
  const { projects, sessions, agents, loaded, reloadProjects } = useDeck();
  const [selected, setSelected] = useState<string | null>(null);
  const session = selected ? sessions[selected] : undefined;
  const [sidebarShown, toggleSidebar] = useStoredToggle("agentdeck.sidebarShown", true);

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
    // The sidebar is on the right; with it hidden, headers leave room for the toggle.
    <div className="group/app flex h-full" data-sidebar={sidebarShown ? "shown" : "hidden"}>
      {/* Shown sidebar has its own hide button; once hidden, this one sits at the top right. */}
      {!sidebarShown && (
        <div className="fixed top-0 right-2 z-10 flex h-12 pt-1.5 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="no-drag"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={toggleSidebar}
          >
            <PanelRightIcon />
          </Button>
        </div>
      )}
      {session ? (
        <SessionView
          key={session.id}
          session={session}
          project={projects.find((p) => p.id === session.projectId)}
          agent={agents.find((a) => a.id === session.agent)}
        />
      ) : (
        <main className="flex flex-1 flex-col">
          <div className="drag h-12 pt-1.5 shrink-0" />
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
      {sidebarShown && (
        <Sidebar
          projects={projects}
          sessions={Object.values(sessions)}
          agents={agents}
          selected={session ? selected : null}
          onSelect={setSelected}
          onAddProject={addProject}
          onProjectRemoved={reloadProjects}
          onHide={toggleSidebar}
        />
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
