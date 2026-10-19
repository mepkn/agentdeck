import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { parseBlocks, parseInline, type Block as MdNode } from "@/lib/markdown";
import { colors } from "@/lib/theme";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Groups the agent's consecutive replies and tool calls into one turn, so each reply is one bubble. */
export function turns(items: Item[]): Item[][] {
  const out: Item[][] = [];
  for (const it of items) {
    const last = out.at(-1);
    if (it.kind !== "user" && last && last[0].kind !== "user") last.push(it);
    else out.push([it]);
  }
  return out;
}

export function Turn({ items }: { items: Item[] }) {
  if (items[0].kind === "user") {
    return (
      <View className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5">
        <Text selectable className="text-[15px] leading-6 text-foreground">
          {items[0].text}
        </Text>
      </View>
    );
  }
  return (
    <View className="mr-auto max-w-[92%] gap-2 rounded-2xl rounded-bl-sm bg-card px-4 py-2.5">
      {items.map((it) =>
        it.kind === "tool" && it.tool ? <ToolRow key={it.id} item={it} /> : <Prose key={it.id} text={it.text ?? ""} />,
      )}
    </View>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <View className="gap-2.5">
      {parseBlocks(text).map((b, i) => (
        <MdBlock key={i} b={b} />
      ))}
    </View>
  );
}

function MdBlock({ b }: { b: MdNode }) {
  switch (b.kind) {
    case "code":
      return (
        <ScrollView horizontal className="rounded-lg bg-code" contentContainerClassName="p-3">
          <Text selectable className="font-mono text-xs leading-5 text-foreground">
            {b.text}
          </Text>
        </ScrollView>
      );
    case "heading":
      return (
        <Text selectable className="text-[16px] font-semibold text-foreground">
          <Inline text={b.text} />
        </Text>
      );
    case "table":
      return (
        <ScrollView horizontal className="rounded-lg border border-border">
          <View>
            {b.rows.map((r, i) => (
              <View key={i} className={cn("flex-row", i > 0 && "border-t border-border", i === 0 && "bg-secondary")}>
                {r.map((c, j) => (
                  <Text
                    key={j}
                    selectable
                    className={cn(
                      "w-36 px-2.5 py-1.5 text-[13px] leading-5 text-foreground",
                      j > 0 && "border-l border-border",
                      i === 0 && "font-semibold",
                    )}
                  >
                    <Inline text={c} />
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    case "list":
      return (
        <View className="gap-1">
          {b.items.map((it, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className="text-[15px] leading-6 text-muted-foreground">{b.ordered ? `${i + 1}.` : "•"}</Text>
              <Text selectable className="flex-1 text-[15px] leading-6 text-foreground">
                <Inline text={it} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <Text selectable className="border-l-2 border-border pl-3 text-[15px] leading-6 text-muted-foreground">
          <Inline text={b.text} />
        </Text>
      );
    case "rule":
      return <View className="h-px bg-border" />;
    default:
      return (
        <Text selectable className="text-[15px] leading-6 text-foreground">
          <Inline text={b.text} />
        </Text>
      );
  }
}

function Inline({ text }: { text: string }) {
  return parseInline(text).map((s, i) =>
    s.code ? (
      <Text key={i} className="font-mono text-[13px] text-primary">
        {s.text}
      </Text>
    ) : s.link ? (
      <Text key={i} className="text-primary underline" onPress={() => void Linking.openURL(s.link!)}>
        {s.text}
      </Text>
    ) : s.bold || s.italic ? (
      <Text key={i} className={cn(s.bold && "font-semibold", s.italic && "italic")}>
        {s.text}
      </Text>
    ) : (
      s.text
    ),
  );
}

function ToolRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const t = item.tool!;
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center gap-2 py-1">
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <ChevronRightIcon size={14} color={colors.muted} />
        </View>
        <Text className="text-sm font-medium text-foreground/80">{t.name}</Text>
        <Text className="flex-1 font-mono text-xs text-muted-foreground" numberOfLines={1}>
          {t.summary !== t.name ? t.summary : ""}
        </Text>
        {!t.done ? (
          <ActivityIndicator size={12} color={colors.muted} />
        ) : t.isError ? (
          <XIcon size={14} color={colors.destructive} />
        ) : (
          <CheckIcon size={14} color={colors.primary} />
        )}
      </Pressable>
      {open && (
        <View className="mt-1 gap-2">
          {t.input ? <Block label="Input" text={t.input} /> : null}
          {t.output ? <Block label="Output" text={t.output} /> : null}
        </View>
      )}
    </View>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <View>
      <Text className="mb-1 text-xs text-muted-foreground">{label}</Text>
      <ScrollView className="max-h-72 rounded-lg bg-code" contentContainerClassName="p-3" nestedScrollEnabled>
        <Text selectable className="font-mono text-xs leading-5 text-foreground">
          {text.length > 20_000 ? text.slice(0, 20_000) + "\n…" : text}
        </Text>
      </ScrollView>
    </View>
  );
}
