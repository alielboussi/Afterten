import { StyleSheet, Text, View, Pressable } from "react-native";
import type { SupervisorOrderRow } from "../lib/supabase";
import { formatOrderDate } from "../lib/currency";
import { formatSupervisorOrderStatus } from "../lib/order-status";

type Props = {
  order: SupervisorOrderRow;
  onPress?: () => void;
};

export function OrderCard({ order, onPress }: Props) {
  const content = (
    <>
      <Text style={styles.outletName}>{order.outlet_name}</Text>
      <Text style={styles.orderNumber}>{order.order_number}</Text>
      <Text style={styles.metaLine}>{formatOrderDate(order.created_at)} (Kitwe)</Text>
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{formatSupervisorOrderStatus(order.status)}</Text>
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Open order summary"
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.card}>{content}</View>;
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
  outletName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#292524",
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e3a8a",
    marginBottom: 4,
  },
  metaLine: {
    fontSize: 13,
    color: "#57534e",
    lineHeight: 18,
  },
  statusRow: { marginTop: 10, flexDirection: "row" },
  statusPill: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
});
