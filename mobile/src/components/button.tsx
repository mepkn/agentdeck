import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { colors } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive";

const box: Record<Variant, string> = {
  default: "bg-primary active:opacity-80",
  outline: "border border-border bg-card active:bg-accent",
  ghost: "active:bg-accent",
  destructive: "border border-destructive/40 active:bg-destructive/10",
};
const label: Record<Variant, string> = {
  default: "text-primary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive",
};

type Props = Omit<PressableProps, "children"> & {
  variant?: Variant;
  icon?: LucideIcon;
  busy?: boolean;
  className?: string;
  textClassName?: string;
  children?: string;
};

export function Button({
  variant = "default",
  icon: Icon,
  busy,
  className,
  textClassName,
  children,
  disabled,
  ...rest
}: Props) {
  const fg = variant === "default" ? "#031b10" : variant === "destructive" ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      className={cn(
        "h-11 flex-row items-center justify-center gap-2 rounded-xl px-4",
        box[variant],
        (disabled || busy) && "opacity-50",
        className,
      )}
      {...rest}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : Icon && <Icon size={18} color={fg} />}
      {children && <Text className={cn("text-[15px] font-medium", label[variant], textClassName)}>{children}</Text>}
    </Pressable>
  );
}

/** A round icon-only button for headers. */
export function IconButton({
  icon: Icon,
  color = colors.foreground,
  className,
  ...rest
}: Omit<PressableProps, "children"> & { icon: LucideIcon; color?: string; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      className={cn("size-10 items-center justify-center rounded-full active:bg-accent", className)}
      {...rest}
    >
      <Icon size={20} color={color} />
    </Pressable>
  );
}
