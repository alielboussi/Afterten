import { StyleSheet, Text, View } from "react-native";
import type { SupervisorOrderRow } from "../lib/supabase";
import { formatKwacha, formatOrderDate } from "../lib/currency";
import { formatSupervisorOrderStatus } from "../lib/order-status";

type Props = {
  order: SupervisorOrderRow;
};

export function OrderCard({ order }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.orderNumber}>{order.order_number}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{formatSupervisorOrderStatus(order.status)}</Text>
        </View>
      </View>
      <Text style={styles.outletName}>{order.outlet_name}</Text>
      <Text style={styles.metaLine}>{formatOrderDate(order.created_at)} (Kitwe)</Text>
      {order.employee_name ? (
        <Text style={styles.metaLine}>Placed by {order.employee_name}</Text>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Grand total</Text>
        <Text style={styles.totalValue}>{formatKwacha(order.grand_total)}</Text>
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  orderNumber: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1e3a8a",
  },
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
  outletName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#292524",
    marginBottom: 4,
  },
  metaLine: {
    fontSize: 13,
    color: "#57534e",
    lineHeight: 18,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
  },
  totalLabel: { fontSize: 13, fontWeight: "600", color: "#57534e" },
  totalValue: { fontSize: 17, fontWeight: "700", color: "#c41e3a" },
});
