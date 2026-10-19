import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeftIcon, ArrowUpIcon, EllipsisVerticalIcon, MoonIcon, SunIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView, KeyboardController } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/button";
import { turns, Turn } from "@/components/chat";
import { LinkBanner } from "@/components/link-banner";
import { PromptCard } from "@/components/prompt-card";
import { StatusDot } from "@/components/status-dot";
import { upsertItems, useDeck, useSession } from "@/lib/deck";
import { dotFor, sessionTitle, statusLabel } from "@/lib/format";
import { colors } from "@/lib/theme";
import type { Item, Key, Request } from "@/lib/types";

const KEYS: { key: Key; label: string }[] = [
  { key: "esc", label: "Esc" },
  { key: "ctrl-c", label: "Ctrl-C" },
  { key: "up", label: "↑" },
  { key: "down", label: "↓" },
  { key: "enter", label: "Enter" },
  { key: "tab", label: "Tab" },
  { key: "shift-tab", label: "⇧Tab" },
];

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request, watch, link, state } = useDeck();
  const s = useSession(id);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watch(id, (changed) => setItems((all) => upsertItems(all, changed))), [id, watch]);

  // Leaving the app with the keyboard open can miss its hide event, leaving
  // the composer raised. Remounting the wrapper drops the stale padding.
  const [kav, setKav] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && !KeyboardController.isVisible()) setKav((k) => k + 1);
    });
    return () => sub.remove();
  }, []);

  // Newest at the bottom: the list is inverted.
  const list = useMemo(() => turns(items).reverse(), [items]);
  const online = link === "online";
  const agent = state?.agents.find((a) => a.id === s?.agent)?.name ?? "Agent";
  const asleep = s?.status === "asleep";
  const working = s?.status === "working" || s?.status === "starting";

  async function run(req: Request) {
    setBusy(true);
    try {
      await request(req);
      return true;
    } catch (e) {
      Alert.alert("Didn't work", e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    if (await run({ op: "send", id, text: t })) setText("");
  }

  function menu() {
    Alert.alert(s ? sessionTitle(s) : "Session", undefined, [
      asleep
        ? { text: "Wake", onPress: () => void run({ op: "wake", id }) }
        : { text: "Sleep", onPress: () => void run({ op: "sleep", id }) },
      {
        text: "Close",
        style: "destructive",
        onPress: () =>
          Alert.alert("Close this session?", "It is removed from agentdeck on the Mac too.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Close",
              style: "destructive",
              onPress: async () => {
                if (await run({ op: "close", id })) router.back();
              },
            },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (state && !s) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background">
        <Text className="text-muted-foreground">This session was closed.</Text>
        <Button variant="outline" onPress={() => router.back()}>
          Back
        </Button>
      </SafeAreaView>
    );
  }

  const dot = s ? dotFor(s) : "idle";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton icon={ArrowLeftIcon} accessibilityLabel="Back" onPress={() => router.back()} />
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-foreground" numberOfLines={1}>
            {s ? sessionTitle(s) : ""}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <StatusDot dot={dot} className="size-1.5" />
            <Text className="text-xs text-muted-foreground">
              {agent} · {statusLabel[dot]}
            </Text>
          </View>
        </View>
        <IconButton
          icon={EllipsisVerticalIcon}
          accessibilityLabel="Session actions"
          disabled={!online}
          onPress={menu}
        />
      </View>
      <LinkBanner />

      <KeyboardAvoidingView key={kav} behavior="padding" className="flex-1">
        <FlatList
          inverted
          data={list}
          keyExtractor={(t) => t[0].id}
          renderItem={({ item }) => <Turn items={item} />}
          contentContainerClassName="gap-4 px-3 py-4"
          ListHeaderComponent={
            working ? (
              <View className="flex-row items-center gap-2 px-1">
                <ActivityIndicator size="small" color={colors.muted} />
                <Text className="text-sm text-muted-foreground">Working…</Text>
              </View>
            ) : null
          }
        />
        {list.length === 0 && !working && (
          <View pointerEvents="none" className="absolute inset-x-0 top-1/3 items-center">
            <Text className="text-sm text-muted-foreground">
              {asleep ? "This session is asleep." : "Send a message to start."}
            </Text>
          </View>
        )}

        {s?.prompt && (
          <PromptCard
            prompt={s.prompt}
            disabled={busy || !online}
            onAnswer={(n) => void run({ op: "answer", id, n })}
          />
        )}

        {asleep ? (
          <View className="px-3 pb-3">
            <Button icon={SunIcon} busy={busy} disabled={!online} onPress={() => void run({ op: "wake", id })}>
              Wake session
            </Button>
          </View>
        ) : (
          <View className="border-t border-border pt-2 pb-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerClassName="gap-2 px-3 pb-2"
            >
              {KEYS.map((k) => (
                <Pressable
                  key={k.key}
                  disabled={!online}
                  onPress={() =>
                    void request({ op: "key", id, key: k.key }).catch((e) =>
                      Alert.alert("Didn't work", String(e?.message ?? e)),
                    )
                  }
                  className="h-8 justify-center rounded-lg border border-border bg-card px-3 active:bg-accent"
                >
                  <Text className="font-mono text-xs text-foreground">{k.label}</Text>
                </Pressable>
              ))}
              {s?.status === "idle" && (
                <Pressable
                  disabled={!online}
                  onPress={() => void run({ op: "sleep", id })}
                  className="h-8 flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-3 active:bg-accent"
                >
                  <MoonIcon size={12} color={colors.muted} />
                  <Text className="text-xs text-foreground">Sleep</Text>
                </Pressable>
              )}
            </ScrollView>
            <View className="flex-row items-end gap-2 px-3">
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Message the agent"
                placeholderTextColor={colors.muted}
                className="max-h-36 min-h-11 flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!text.trim() || busy || !online}
                onPress={() => void send()}
                className="size-11 items-center justify-center rounded-full bg-primary active:opacity-80 disabled:opacity-40"
              >
                {busy ? <ActivityIndicator size="small" color="#031b10" /> : <ArrowUpIcon size={20} color="#031b10" />}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
