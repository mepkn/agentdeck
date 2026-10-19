import { Text, View, ScrollView, Pressable } from "react-native";
import type { Prompt } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A menu the agent is waiting on, read from its terminal screen. */
export function PromptCard({
  prompt,
  onAnswer,
  disabled,
}: {
  prompt: Prompt;
  onAnswer: (n: number) => void;
  disabled?: boolean;
}) {
  // Rows of box-drawing rules read as noise on a narrow screen.
  const context = (prompt.context ?? []).filter((l) => !/^[\s_\u2500-\u257f-]*$/.test(l));
  return (
    <View className="mx-3 mb-2 rounded-2xl border border-status-waiting/40 bg-card p-4">
      {context.length > 0 && (
        <ScrollView className="mb-3 max-h-36 rounded-lg bg-code" contentContainerClassName="p-3" nestedScrollEnabled>
          <Text selectable className="font-mono text-xs leading-5 text-foreground">
            {context.join("\n")}
          </Text>
        </ScrollView>
      )}
      <Text className="mb-3 text-[15px] font-medium text-foreground">{prompt.question}</Text>
      <View className="gap-2">
        {(prompt.options ?? []).map((o) => (
          <Pressable
            key={o.number}
            disabled={disabled}
            onPress={() => onAnswer(o.number)}
            className={cn(
              "flex-row items-center gap-2 rounded-xl px-3 py-3",
              o.number === 1 ? "bg-primary active:opacity-80" : "border border-border active:bg-accent",
              disabled && "opacity-50",
            )}
          >
            <Text
              className={cn(
                "font-mono text-xs",
                o.number === 1 ? "text-primary-foreground/60" : "text-muted-foreground",
              )}
            >
              {o.number}
            </Text>
            <Text className={cn("flex-1 text-[15px]", o.number === 1 ? "text-primary-foreground" : "text-foreground")}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
