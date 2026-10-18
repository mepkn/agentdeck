import { useState } from "react";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Deck, errorMessage, type AgentInfo, type Info } from "@/lib/api";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

type Choice = { value: string; label: string };

// Model, permission mode and context use, under the composer.
export function ChatControls({ session, agent }: { session: Info; agent?: AgentInfo }) {
  const models = agent?.models ?? [];
  const modes = agent?.modes ?? [];
  const efforts = agent?.efforts ?? [];
  const meta = session.meta;
  if (models.length === 0 && modes.length === 0) return null;

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
          className={cn(mode?.value === "plan" && "text-sky-400", mode?.value === "bypassPermissions" && "text-destructive")}
          onPick={(v) => Deck.SetMode(session.id, v)}
        />
      )}
      <ContextMeter used={meta.contextUsed} size={meta.contextWindow} />
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
      className="ml-auto flex h-7 items-center gap-1.5 px-2 tabular-nums"
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
