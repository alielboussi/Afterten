import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKwacha, formatOrderDate } from "../lib/currency";
import { downloadCompletedOrderPdf } from "../lib/completed-order-pdf";

export type SupervisorCompletedOrderRow = {
  order_id: string;
  outlet_name: string;
  order_number: string;
  grand_total: number;
  completed_at: string | null;
};

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  onOpenDetail: (orderId: string) => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

export function CompletedOrdersScreen({
  supabase,
  onBack,
  onOpenDetail,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<SupervisorCompletedOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("list_supervisor_completed_orders", {
      p_query: query.trim() || null,
    });
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
          outlet_name: String(r.outlet_name ?? ""),
          order_number: String(r.order_number ?? ""),
          grand_total: Number(r.grand_total ?? 0),
          completed_at: r.completed_at != null ? String(r.completed_at) : null,
        };
      }),
    );
  }, [supabase, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function onPdf(orderId: string) {
    if (pdfBusyId) return;
    setPdfBusyId(orderId);
    onToast("Preparing full order PDF…");
    const result = await downloadCompletedOrderPdf(supabase, orderId);
    setPdfBusyId(null);
    onToast(result.ok ? `Downloaded ${result.fileName}` : result.error);
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Completed Orders</Text>
      <Text style={styles.lead}>Download the combined signed PDF (all outlets).</Text>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search order or outlet…"
        placeholderTextColor="#a8a29e"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#c41e3a" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={<Text style={styles.empty}>No completed orders found.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => onOpenDetail(item.order_id)}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.outletName}>{item.outlet_name}</Text>
                  <Text style={styles.orderNumber}>{item.order_number}</Text>
                  <Text style={styles.meta}>
                    Completed{" "}
                    {item.completed_at ? formatOrderDate(item.completed_at) : "—"} (Kitwe)
                  </Text>
                  <Text style={styles.total}>{formatKwacha(item.grand_total)}</Text>
                </View>
                <Pressable
                  style={styles.pdfBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void onPdf(item.order_id);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Download completed order PDF"
                >
                  {pdfBusyId === item.order_id ? (
                    <ActivityIndicator size="small" color="#1e3a8a" />
                  ) : (
                    <Ionicons name="document-outline" size={28} color="#1e3a8a" />
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
  searchInput: {
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
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
