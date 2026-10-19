import { useEffect, useState } from "react";
import { FolderPlusIcon, PanelLeftIcon } from "lucide-react";
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
    // With the sidebar hidden, headers leave room for the traffic lights and the toggle.
    <div className="group/app flex h-full" data-sidebar={sidebarShown ? "shown" : "hidden"}>
      {/* Shown sidebar has its own hide button; once hidden, this one sits after the traffic lights. */}
      {!sidebarShown && (
        <div className="fixed top-0 left-21 z-10 flex h-13 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="no-drag"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </Button>
        </div>
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
      {session ? (
        <SessionView
          key={session.id}
          session={session}
          project={projects.find((p) => p.id === session.projectId)}
          agent={agents.find((a) => a.id === session.agent)}
        />
      ) : (
        <main className="flex flex-1 flex-col">
          <div className="drag h-13 shrink-0 group-data-[sidebar=hidden]/app:pl-31" />
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
