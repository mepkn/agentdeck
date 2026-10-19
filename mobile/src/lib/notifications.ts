import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// The Mac sends these through Expo when an agent needs you or finishes. The
// text is generic; the session ID in data opens the chat.

export const CHANNEL_ID = "agents";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Agents",
    description: "When an agent needs you or finishes",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Asks for permission (the channel must exist first on Android 13+) and returns the Expo push token. */
export async function pushToken(): Promise<string | null> {
  if (!Device.isDevice && Platform.OS === "ios") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  await ensureChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted" && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== "granted") return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // No Firebase config in this build.
    return null;
  }
}

export function deviceName(): string {
  return Device.deviceName ?? ([Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || "Android phone");
}

export function sessionFrom(response: Notifications.NotificationResponse): string | undefined {
  const id = response.notification.request.content.data?.session;
  return typeof id === "string" ? id : undefined;
}
