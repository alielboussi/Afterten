import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKwacha, formatOrderDate } from "../lib/currency";
import { downloadApprovedOrderPdf } from "../lib/approved-order-pdf";

export type OutletAcceptedOrderRow = {
  order_id: string;
  order_number: string;
  outlet_name: string;
  grand_total: number;
  created_at: string;
  supervisor_accepted_at: string | null;
  employee_name: string | null;
};

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  onOpenOrder: (orderId: string) => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

export function ViewOrdersScreen({
  supabase,
  onBack,
  onOpenOrder,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [orders, setOrders] = useState<OutletAcceptedOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("list_outlet_accepted_orders");
    setLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    setOrders(
      rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          order_id: String(r.order_id ?? ""),
          order_number: String(r.order_number ?? ""),
          outlet_name: String(r.outlet_name ?? ""),
          grand_total: Number(r.grand_total ?? 0),
          created_at: String(r.created_at ?? ""),
          supervisor_accepted_at:
            r.supervisor_accepted_at != null ? String(r.supervisor_accepted_at) : null,
          employee_name: r.employee_name != null ? String(r.employee_name) : null,
        };
      }),
    );
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPdf(orderId: string) {
    if (pdfBusyId) return;
    setPdfBusyId(orderId);
    onToast("Preparing PDF…");
    const result = await downloadApprovedOrderPdf(supabase, orderId);
    setPdfBusyId(null);
    onToast(result.ok ? `Downloaded ${result.fileName}` : result.error);
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Dashboard</Text>
      </Pressable>
      <Text style={styles.title}>View Orders</Text>
      <Text style={styles.lead}>Supervisor-approved orders with the latest line changes.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#c41e3a" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={<Text style={styles.empty}>No approved orders yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => onOpenOrder(item.order_id)}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.outletName}>{item.outlet_name}</Text>
                  <Text style={styles.orderNumber}>{item.order_number}</Text>
                  <Text style={styles.meta}>
                    {formatOrderDate(item.supervisor_accepted_at ?? item.created_at)} (Kitwe)
                  </Text>
                  <Text style={styles.total}>{formatKwacha(item.grand_total)}</Text>
                </View>
                <Pressable
                  style={styles.pdfBtn}
                  onPress={() => void onPdf(item.order_id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Download PDF"
                >
                  {pdfBusyId === item.order_id ? (
                    <ActivityIndicator size="small" color="#1e3a8a" />
                  ) : (
                    <Ionicons name="document-outline" size={26} color="#1e3a8a" />
                  )}
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backLink: { marginBottom: 8, alignSelf: "flex-start" },
  backLinkText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "center",
    marginBottom: 4,
  },
  lead: {
    fontSize: 13,
    color: "#57534e",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 18,
  },
  error: { color: "#b91c1c", marginBottom: 8, textAlign: "center" },
  empty: { textAlign: "center", color: "#78716c", marginTop: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  outletName: { fontSize: 16, fontWeight: "700", color: "#292524" },
  orderNumber: { fontSize: 14, fontWeight: "700", color: "#1e3a8a", marginTop: 2 },
  meta: { fontSize: 12, color: "#57534e", marginTop: 4 },
  total: { fontSize: 15, fontWeight: "700", color: "#c41e3a", marginTop: 6 },
  pdfBtn: { padding: 6 },
});
