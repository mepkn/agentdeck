import "@/lib/polyfill";
import "@/global.css";

import * as Notifications from "expo-notifications";
import { router, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DeckProvider, useDeck } from "@/lib/deck";
import { sessionFrom } from "@/lib/notifications";
import { NAV_THEME } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

function Root() {
  const { loaded, mac } = useDeck();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  // Tapping "Claude Code needs you" opens that chat.
  const tapped = response ? sessionFrom(response) : undefined;
  useEffect(() => {
    if (loaded && mac && tapped) router.push({ pathname: "/session/[id]", params: { id: tapped } });
  }, [loaded, mac, tapped]);

  if (!loaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: NAV_THEME.colors.background } }}>
      <Stack.Protected guard={!!mac}>
        <Stack.Screen name="index" />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Screen name="pair" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider value={NAV_THEME}>
          <StatusBar style="light" />
          <DeckProvider>
            <Root />
          </DeckProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
