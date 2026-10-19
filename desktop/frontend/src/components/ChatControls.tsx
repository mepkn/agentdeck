import { useState } from "react";
import { ChevronDownIcon, EllipsisIcon, ListCollapseIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClaudeUsage } from "@/hooks/use-claude-usage";
import { Deck, errorMessage, type AgentInfo, type Info, type Limit } from "@/lib/api";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

type Choice = { value: string; label: string };

// The ⋯ button in the composer that hides or shows the controls.
export function ControlsToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? "Hide session details" : "Show model, effort, mode and context";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={label}
      title={label}
      className="text-muted-foreground"
    >
      <EllipsisIcon />
    </Button>
  );
}

// Model, effort, permission mode, summary mode and context use, above the composer.
export function ChatControls({
  session,
  agent,
  summary,
  onSummary,
}: {
  session: Info;
  agent?: AgentInfo;
  summary: boolean;
  onSummary: () => void;
}) {
  const models = agent?.models ?? [];
  const modes = agent?.modes ?? [];
  const efforts = agent?.efforts ?? [];
  const meta = session.meta;
  const usage = useClaudeUsage(session.agent === "claude");

  const model = models.find((m) => m.label === meta.model);
  const mode = modes.find((m) => m.value === meta.mode);
  const effort = efforts.find((e) => e.value === meta.effort);

  return (
    <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
      {models.length > 0 && (
        <Picker
          title="Model"
          choices={models}
          value={model?.value}
          label={meta.model || "Model"}
          note="Applies to this session only."
          onPick={(v) => Deck.SetModel(session.id, v)}
        />
      )}
      {efforts.length > 0 && meta.effort && (
        <Picker
          title="Effort"
          choices={efforts}
          value={effort?.value}
          label={effort?.label ?? meta.effort}
          note="Applies to this session only."
          onPick={(v) => Deck.SetEffort(session.id, v)}
        />
      )}
      {modes.length > 0 && (
        <Picker
          title="Permission mode"
          choices={modes}
          value={mode?.value}
          label={mode?.label ?? "Mode"}
          className={cn(
            mode?.value === "plan" && "text-sky-400",
            mode?.value === "bypassPermissions" && "text-destructive",
          )}
          onPick={(v) => Deck.SetMode(session.id, v)}
        />
      )}
      <button
        type="button"
        onClick={onSummary}
        aria-pressed={summary}
        title={summary ? "Summary: tool calls hidden. Click to show them." : "Hide tool calls (summary)"}
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground",
          summary && "bg-muted text-foreground",
        )}
      >
        <ListCollapseIcon className="size-3.5" /> Summary
      </button>
      <div className="ml-auto flex items-center">
        {usage?.fiveHour && <LimitMeter name="5h" limit={usage.fiveHour} />}
        {usage?.sevenDay && <LimitMeter name="7d" limit={usage.sevenDay} />}
        <ContextMeter used={meta.contextUsed} size={meta.contextWindow} />
      </div>
    </div>
  );
}

function Picker({
  title,
  choices,
  value,
  label,
  note,
  className,
  onPick,
}: {
  title: string;
  choices: Choice[];
  value?: string;
  label: string;
  note?: string;
  className?: string;
  onPick: (value: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function pick(v: string) {
    if (v === value || busy) return;
    setBusy(true);
    try {
      await onPick(v);
    } catch (e) {
      toast.error(errorMessage(e, `Could not change the ${title.toLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        title={title}
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground data-popup-open:bg-muted",
          className,
        )}
      >
        {label}
        {busy ? <LoaderIcon className="size-3 animate-spin" /> : <ChevronDownIcon className="size-3" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => pick(v as string)}>
            {choices.map((c) => (
              <DropdownMenuRadioItem key={c.value} value={c.value} closeOnClick>
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {note && <DropdownMenuLabel className="font-normal">{note}</DropdownMenuLabel>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextMeter({ used, size }: { used: number; size: number }) {
  if (!size) return null;
  const pct = Math.min(100, (used / size) * 100);
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex h-7 items-center gap-1.5 px-2 tabular-nums"
      title={`Context: ${used.toLocaleString()} of ${size.toLocaleString()} tokens`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className={cn(pct >= 80 ? "stroke-status-waiting" : "stroke-current")}
        />
      </svg>
      {Math.round(pct)}% · {formatTokens(used)} / {formatTokens(size)}
    </div>
  );
}

// One Claude plan limit, such as "5h: 21%", with its reset time on hover.
function LimitMeter({ name, limit }: { name: string; limit: Limit }) {
  const pct = Math.round(limit.percent);
  const resets = limit.resetsAt
    ? new Date(limit.resetsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <span
      className={cn("flex h-7 items-center px-2 tabular-nums", pct >= 80 && "text-status-waiting")}
      title={`${name === "5h" ? "5-hour" : "Weekly"} limit: ${pct}% used${resets ? `, resets ${resets}` : ""}`}
    >
      {name}: {pct}%
    </span>
  );
}
