import { useSyncExternalStore } from "react";
import { ChevronDownIcon, CodeIcon, FolderOpenIcon, GitBranchIcon, SquareTerminalIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenApps } from "@/hooks/use-open-apps";
import { Deck, errorMessage } from "@/lib/api";

const APPS = ["Finder", "Terminal", "Zed"];
const ICONS: Record<string, typeof FolderOpenIcon> = {
  Finder: FolderOpenIcon,
  Terminal: SquareTerminalIcon,
  Zed: CodeIcon,
};

// The last app picked becomes the folder button's default, remembered across launches.
const LAST_KEY = "agentdeck.openIn";
const listeners = new Set<() => void>();

function readLast() {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v && APPS.includes(v) ? v : "Finder";
  } catch {
    return "Finder";
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function openIn(projectId: string, app: string) {
  try {
    localStorage.setItem(LAST_KEY, app);
  } catch {
    // Not remembered this time; opening still works.
  }
  listeners.forEach((fn) => fn());
  Deck.OpenIn(projectId, app).catch((e) => toast.error(errorMessage(e, `Could not open ${app}.`)));
}

// Menu items that open a project's folder in each app; missing apps are greyed out.
export function OpenInItems({ projectId }: { projectId: string }) {
  const installed = useOpenApps();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Open in</DropdownMenuLabel>
      {APPS.map((app) => (
        <DropdownMenuItem key={app} disabled={!installed.includes(app)} onClick={() => openIn(projectId, app)}>
          {(() => {
            const Icon = ICONS[app];
            return <Icon />;
          })()}
          {app}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

// Button that opens the project in the last app used, with a menu for the others.
export function OpenInButton({ projectId }: { projectId: string }) {
  const last = useSyncExternalStore(subscribe, readLast);
  const Icon = ICONS[last];
  return (
    <div className="no-drag flex items-center rounded-lg text-muted-foreground">
      <button
        type="button"
        onClick={() => openIn(projectId, last)}
        title={`Open in ${last}`}
        aria-label={`Open in ${last}`}
        className="flex h-7 items-center rounded-l-md pr-1 pl-2 hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          title="Open in…"
          aria-label="Open in…"
          className="flex h-7 items-center rounded-r-md pr-1.5 pl-0.5 hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
        >
          <ChevronDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <OpenInItems projectId={projectId} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function openLazygit(projectId: string, install = false) {
  Deck.OpenLazygit(projectId, install).catch((e) => {
    const msg = errorMessage(e, "Could not open lazygit.");
    if (msg.includes("lazygit is not installed")) {
      toast("lazygit is not installed", {
        description: "Install it with Homebrew in Terminal, then open it.",
        action: { label: "Install", onClick: () => openLazygit(projectId, true) },
      });
    } else {
      toast.error(msg);
    }
  });
}

// Button that opens lazygit in Terminal, in the project's folder.
export function LazygitButton({ projectId }: { projectId: string }) {
  return (
    <button
      type="button"
      onClick={() => openLazygit(projectId)}
      title="Open lazygit"
      aria-label="Open lazygit"
      className="no-drag flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <GitBranchIcon className="size-4" />
    </button>
  );
}
