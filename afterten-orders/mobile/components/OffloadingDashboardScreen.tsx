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
import { fetchOffloadingOrders, type OffloadingOrderRow } from "../lib/offloading";

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  onOpenChecklist: (orderId: string) => void;
  onOpenSign: (orderId: string) => void;
  onSignBlocked: () => void;
  refreshToken: number;
  contentPaddingBottom: number;
};

export function OffloadingDashboardScreen({
  supabase,
  onBack,
  onOpenChecklist,
  onOpenSign,
  onSignBlocked,
  refreshToken,
  contentPaddingBottom,
}: Props) {
  const [orders, setOrders] = useState<OffloadingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchOffloadingOrders(supabase);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOrders(result.orders);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Dashboard</Text>
      </Pressable>
      <Text style={styles.title}>Offloading</Text>
      <Text style={styles.lead}>Dispatched orders for your outlet — confirm receipt, then sign off.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#c41e3a" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={<Text style={styles.empty}>No dispatched orders waiting.</Text>}
          renderItem={({ item }) => (
            <OffloadingOrderCard
              item={item}
              onChecklist={() => onOpenChecklist(item.order_id)}
              onSign={() => {
                if (!item.offloading_checklist_completed_at) {
                  onSignBlocked();
                  return;
                }
                onOpenSign(item.order_id);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function OffloadingOrderCard({
  item,
  onChecklist,
  onSign,
}: {
  item: OffloadingOrderRow;
  onChecklist: () => void;
  onSign: () => void;
}) {
  const checklistDone = Boolean(item.offloading_checklist_completed_at);
  const signatureReady = checklistDone;

  return (
    <Pressable style={styles.card} onPress={onChecklist}>
      <Text style={styles.outletName}>{item.outlet_name}</Text>
      <Text style={styles.orderNumber}>{item.order_number}</Text>
      <Text style={styles.meta}>
        Dispatched {item.loaded_at ? formatOrderDate(item.loaded_at) : "—"} (Kitwe)
      </Text>
      <Text style={styles.total}>{formatKwacha(item.grand_total)}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={onChecklist}
          accessibilityRole="button"
          accessibilityLabel="Receiving checklist"
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={28}
            color={checklistDone ? "#047857" : "#1e3a8a"}
          />
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={onSign}
          accessibilityRole="button"
          accessibilityLabel="Complete order signature"
        >
          <Ionicons
            name="create-outline"
            size={28}
            color={signatureReady ? "#c41e3a" : "#a8a29e"}
          />
        </Pressable>
      </View>
    </Pressable>
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
  outletName: { fontSize: 16, fontWeight: "700", color: "#292524" },
  orderNumber: { fontSize: 14, fontWeight: "700", color: "#1e3a8a", marginTop: 2 },
  meta: { fontSize: 12, color: "#57534e", marginTop: 4 },
  total: { fontSize: 15, fontWeight: "700", color: "#c41e3a", marginTop: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 12 },
  actionBtn: { padding: 6 },
});
