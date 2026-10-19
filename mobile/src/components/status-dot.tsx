import { View } from "react-native";
import type { Dot } from "@/lib/format";
import { cn } from "@/lib/utils";

const styles: Record<Dot, string> = {
  working: "bg-status-working",
  waiting: "bg-status-waiting",
  done: "bg-status-done",
  idle: "bg-muted-foreground/40",
  asleep: "border border-muted-foreground/60",
};

export function StatusDot({ dot, className }: { dot: Dot; className?: string }) {
  return <View className={cn("size-2.5 rounded-full", styles[dot], className)} />;
}
