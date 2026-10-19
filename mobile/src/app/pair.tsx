import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeftIcon, ClipboardPasteIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/button";
import { useDeck } from "@/lib/deck";
import { parsePairCode } from "@/lib/pairing";
import { colors } from "@/lib/theme";

// Reached at start, or from agentdeck://pair?d=… when the system camera scans the Mac's code.
export default function PairScreen() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const { pair, mac } = useDeck();
  const [permission, requestPermission] = useCameraPermissions();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef<string | null>(null);

  async function submit(value: string) {
    if (busy || tried.current === value) return;
    tried.current = value;
    const code = parsePairCode(value);
    if (!code) {
      setError("That isn't an agentdeck pairing code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pair(code);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed.");
      tried.current = null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Only when a link opens this screen; after this render, since submit sets state.
    if (d) queueMicrotask(() => void submit(`agentdeck://pair?d=${d}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="h-14 flex-row items-center px-2">
        {mac && router.canGoBack() && <IconButton icon={ArrowLeftIcon} onPress={() => router.back()} />}
      </View>
      <View className="flex-1 px-6">
        <Text className="text-3xl font-semibold text-foreground">Pair with your Mac</Text>
        <Text className="mt-2 text-[15px] leading-6 text-muted-foreground">
          On the Mac, open agentdeck, click the phone button in the sidebar and choose Pair a phone. Then scan the code.
        </Text>

        <View className="mt-6 aspect-square w-full overflow-hidden rounded-3xl border border-border bg-card">
          {permission?.granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void submit(data)}
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-4 p-6">
              <Text className="text-center text-muted-foreground">The camera reads the code on the Mac.</Text>
              <Button onPress={() => void requestPermission()}>Use the camera</Button>
            </View>
          )}
        </View>

        <Text className="mt-6 mb-2 text-sm text-muted-foreground">Or paste the pairing link</Text>
        <View className="flex-row gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="agentdeck://pair?d=…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            className="h-11 flex-1 rounded-xl border border-border bg-card px-3 text-foreground"
          />
          <IconButton
            icon={ClipboardPasteIcon}
            className="size-11 rounded-xl border border-border bg-card"
            accessibilityLabel="Paste"
            onPress={async () => setText(await Clipboard.getStringAsync())}
          />
        </View>
        <Button className="mt-3" busy={busy} disabled={!text.trim()} onPress={() => void submit(text.trim())}>
          Pair
        </Button>
        {busy && <Text className="mt-3 text-center text-sm text-muted-foreground">Reaching your Mac…</Text>}
        {error && <Text className="mt-3 text-center text-sm text-destructive">{error}</Text>}
      </View>
    </SafeAreaView>
  );
}
