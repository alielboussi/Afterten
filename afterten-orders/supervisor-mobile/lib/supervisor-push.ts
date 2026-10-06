import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { SupabaseClient } from "@supabase/supabase-js";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerSupervisorPushNotifications(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return { ok: false, reason: "Notification permission not granted." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Orders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;

  if (!projectId) {
    return {
      ok: false,
      reason:
        "Missing EAS projectId. Run eas init in supervisor-mobile and rebuild the app (Expo Go cannot receive production push).",
    };
  }

  let token: string;
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenResult.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not get push token.";
    return { ok: false, reason: msg };
  }

  const { error } = await supabase.rpc("register_supervisor_push_token", {
    p_expo_push_token: token,
    p_platform: Platform.OS,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
