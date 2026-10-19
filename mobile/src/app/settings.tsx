import { router } from "expo-router";
import { ArrowLeftIcon, QrCodeIcon, UnlinkIcon } from "lucide-react-native";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/button";
import { useDeck } from "@/lib/deck";

export default function SettingsScreen() {
  const { mac, link, unpair } = useDeck();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton icon={ArrowLeftIcon} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text className="text-lg font-semibold text-foreground">Settings</Text>
      </View>
      <View className="gap-6 px-5 pt-2">
        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs text-muted-foreground">Paired Mac</Text>
          <Text className="mt-1 text-lg text-foreground">{mac?.name}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {link === "online" ? "Connected" : link === "away" ? "Offline" : "Connecting"} through{" "}
            {mac && new URL(mac.relay).host}
          </Text>
          <Text className="mt-3 text-xs leading-5 text-muted-foreground">
            {"Messages are end-to-end encrypted between this phone and the Mac; the relay can't read them."}
          </Text>
        </View>
        <Button variant="outline" icon={QrCodeIcon} onPress={() => router.push("/pair")}>
          Pair again
        </Button>
        <Button
          variant="destructive"
          icon={UnlinkIcon}
          onPress={() =>
            Alert.alert("Unpair this phone?", "Also remove it on the Mac, in the phone dialog.", [
              { text: "Cancel", style: "cancel" },
              { text: "Unpair", style: "destructive", onPress: () => void unpair() },
            ])
          }
        >
          Unpair
        </Button>
      </View>
    </SafeAreaView>
  );
}
