import { cn } from "@/lib/utils";
import { statusLabel, type Dot } from "@/lib/format";

const styles: Record<Dot, string> = {
  working: "bg-status-working animate-pulse",
  waiting: "bg-status-waiting",
  done: "bg-status-done",
  idle: "bg-muted-foreground/40",
  asleep: "border border-muted-foreground/50",
};

export function StatusDot({ dot, className }: { dot: Dot; className?: string }) {
  return (
    <span
      role="img"
      aria-label={statusLabel[dot]}
      title={statusLabel[dot]}
      className={cn("inline-block size-2 shrink-0 rounded-full", styles[dot], className)}
    />
  );
}
