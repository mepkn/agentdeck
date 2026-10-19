import { Text, View } from "react-native";
import { useDeck } from "@/lib/deck";

/** Says why nothing updates: no relay connection, or the Mac is away. */
export function LinkBanner() {
  const { link, mac } = useDeck();
  if (link === "online") return null;
  const text =
    link === "away"
      ? `${mac?.name ?? "Your Mac"} is offline. Open agentdeck on the Mac, or wake it.`
      : "Connecting to the relay…";
  return (
    <View className="mx-4 mb-2 rounded-xl border border-border bg-card px-4 py-3">
      <Text className="text-sm text-muted-foreground">{text}</Text>
    </View>
  );
}
