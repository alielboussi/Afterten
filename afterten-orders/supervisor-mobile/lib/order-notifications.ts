import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { formatKwacha } from "./currency";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId?.trim();
  if (fromExtra) return fromExtra;
  const env = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  return env || undefined;
}

export async function ensureSupervisorNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "New outlet orders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function registerSupervisorExpoPushToken(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const granted = await ensureSupervisorNotifications();
  if (!granted) {
    return { ok: false, error: "Notification permission denied." };
  }

  const projectId = resolveEasProjectId();
  if (!projectId) {
    return {
      ok: false,
      error: "Set EXPO_PUBLIC_EAS_PROJECT_ID after eas init (see PUSH_AND_EAS.md).",
    };
  }

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data?.trim();
    if (!token) return { ok: false, error: "Could not obtain Expo push token." };

    const { error } = await supabase.rpc("register_supervisor_push_token", {
      p_expo_push_token: token,
      p_platform: Platform.OS,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Push registration failed." };
  }
}

type OrderInsertRow = {
  order_number?: string;
  outlet_name?: string;
  grand_total?: number;
};

/** Foreground / Realtime fallback while app is open. */
export function subscribeToPlacedOrders(supabase: SupabaseClient): () => void {
  const channel = supabase
    .channel("supervisor-outlet-orders")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "outlet_orders" },
      (payload) => {
        const row = payload.new as OrderInsertRow;
        const orderNo = row.order_number ?? "New order";
        const outlet = row.outlet_name ?? "Outlet";
        const total =
          typeof row.grand_total === "number" ? formatKwacha(row.grand_total) : "";
        void Notifications.scheduleNotificationAsync({
          content: {
            title: "New outlet order",
            body: `${outlet}: ${orderNo}${total ? ` · ${total}` : ""}`,
            sound: true,
          },
          trigger: null,
        });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
