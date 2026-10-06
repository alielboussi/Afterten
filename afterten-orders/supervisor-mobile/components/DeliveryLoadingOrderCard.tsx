import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SupervisorOrderRow } from "../lib/supabase";
import { formatOrderDate } from "../lib/currency";
import { formatSupervisorOrderStatus } from "../lib/order-status";

type Props = {
  order: SupervisorOrderRow;
  onChecklistPress: () => void;
  onSignaturePress: () => void;
  onSignatureBlocked?: () => void;
};

export function DeliveryLoadingOrderCard({
  order,
  onChecklistPress,
  onSignaturePress,
  onSignatureBlocked,
}: Props) {
  const checklistDone = Boolean(order.loading_checklist_completed_at);
  const loaded = order.status === "loaded";
  const signatureReady = checklistDone && !loaded;

  function onSignatureTap() {
    if (loaded) return;
    if (!checklistDone) {
      onSignatureBlocked?.();
      return;
    }
    onSignaturePress();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.outletName}>{order.outlet_name}</Text>
      <Text style={styles.orderNumber}>{order.order_number}</Text>
      <Text style={styles.metaLine}>{formatOrderDate(order.created_at)} (Kitwe)</Text>
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{formatSupervisorOrderStatus(order.status)}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={onChecklistPress}
          accessibilityRole="button"
          accessibilityLabel="Loading checklist"
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={28}
            color={loaded || checklistDone ? "#047857" : "#1e3a8a"}
          />
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={onSignatureTap}
          accessibilityRole="button"
          accessibilityLabel="Driver signature"
        >
          <Ionicons
            name="create-outline"
            size={28}
            color={loaded ? "#047857" : signatureReady ? "#c41e3a" : "#a8a29e"}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 14,
    marginBottom: 12,
  },
  outletName: { fontSize: 17, fontWeight: "700", color: "#292524", marginBottom: 4 },
  orderNumber: { fontSize: 15, fontWeight: "700", color: "#1e3a8a", marginBottom: 4 },
  metaLine: { fontSize: 13, color: "#57534e", lineHeight: 18 },
  statusRow: { marginTop: 10, flexDirection: "row" },
  statusPill: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: "700", color: "#047857" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 12 },
  actionBtn: { padding: 6 },
});
