import { router } from "expo-router";
import { PlusIcon, SettingsIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "@/components/button";
import { LinkBanner } from "@/components/link-banner";
import { StatusDot } from "@/components/status-dot";
import { useDeck } from "@/lib/deck";
import { dotFor, sessionTitle, sortSessions, statusLabel, timeAgo } from "@/lib/format";
import { colors } from "@/lib/theme";
import type { AgentInfo, Project, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SessionsScreen() {
  const { mac, link, state, request, refresh } = useDeck();
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const agents = (state?.agents ?? []).filter((a) => a.installed);
  const agentName = (id: string) => state?.agents.find((a) => a.id === id)?.name ?? id;

  async function start(project: Project, agent: AgentInfo) {
    setStarting(project.id);
    try {
      const s = await request<Session>({ op: "start", projectId: project.id, agent: agent.id });
      router.push({ pathname: "/session/[id]", params: { id: s.id } });
    } catch (e) {
      Alert.alert("Couldn't start", e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(null);
    }
  }

  function chooseAgent(project: Project) {
    if (agents.length === 0) {
      Alert.alert("No agents", "Install an agent CLI on the Mac first.");
    } else if (agents.length === 1) {
      void start(project, agents[0]);
    } else {
      Alert.alert(
        `New session in ${project.name}`,
        undefined,
        agents.slice(0, 3).map((a) => ({ text: a.name, onPress: () => void start(project, a) })),
        { cancelable: true },
      );
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="h-14 flex-row items-center pr-2 pl-5">
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">agentdeck</Text>
          <View className="flex-row items-center gap-1.5">
            <View
              className={cn(
                "size-1.5 rounded-full",
                link === "online" ? "bg-status-done" : link === "away" ? "bg-status-waiting" : "bg-muted-foreground",
              )}
            />
            <Text className="text-xs text-muted-foreground">
              {mac?.name} · {link === "online" ? "connected" : link === "away" ? "offline" : "connecting"}
            </Text>
          </View>
        </View>
        <IconButton icon={SettingsIcon} accessibilityLabel="Settings" onPress={() => router.push("/settings")} />
      </View>
      <LinkBanner />

      <ScrollView
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          />
        }
      >
        {!state && link === "online" && <ActivityIndicator className="mt-16" color={colors.muted} />}
        {state && state.projects.length === 0 && (
          <Text className="mt-16 px-8 text-center text-muted-foreground">
            No projects yet. Add a project folder in agentdeck on the Mac.
          </Text>
        )}
        {state?.projects.map((p) => {
          const sessions = sortSessions(state.sessions.filter((s) => s.projectId === p.id));
          return (
            <View key={p.id} className="mt-4">
              <View className="flex-row items-center pr-2 pl-5">
                <Text
                  className="flex-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                {starting === p.id ? (
                  <View className="size-10 items-center justify-center">
                    <ActivityIndicator size="small" color={colors.muted} />
                  </View>
                ) : (
                  <IconButton
                    icon={PlusIcon}
                    color={colors.muted}
                    accessibilityLabel={`New session in ${p.name}`}
                    disabled={link !== "online"}
                    onPress={() => chooseAgent(p)}
                  />
                )}
              </View>
              {sessions.length === 0 && <Text className="px-5 py-2 text-sm text-muted-foreground/70">No sessions</Text>}
              {sessions.map((s) => (
                <SessionRow key={s.id} s={s} agent={agentName(s.agent)} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionRow({ s, agent }: { s: Session; agent: string }) {
  const dot = dotFor(s);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/session/[id]", params: { id: s.id } })}
      className="mx-2 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-accent"
    >
      <StatusDot dot={dot} />
      <View className="flex-1">
        <Text className={cn("text-[15px] text-foreground", s.unread && "font-semibold")} numberOfLines={1}>
          {sessionTitle(s)}
        </Text>
        <Text className={cn("mt-0.5 text-xs", dot === "waiting" ? "text-status-waiting" : "text-muted-foreground")}>
          {agent} · {statusLabel[dot]}
        </Text>
      </View>
      <Text className="text-xs text-muted-foreground">{timeAgo(s.updatedAt)}</Text>
    </Pressable>
  );
}
