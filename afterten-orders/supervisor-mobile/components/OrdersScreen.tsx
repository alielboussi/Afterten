import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSupervisorOrders, type SupervisorOrderRow } from "../lib/supabase";
import { OrderCard } from "./OrderCard";

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  contentPaddingBottom: number;
  onOpenOrder?: (orderId: string) => void;
  statusFilter?: string | null;
  title?: string;
  subtitle?: string;
};

export function OrdersScreen({
  supabase,
  onBack,
  contentPaddingBottom,
  onOpenOrder,
  statusFilter = "placed",
  title = "View orders",
  subtitle = "Search by order number, outlet name, date, amount, or placed-by name.",
}: Props) {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<SupervisorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const orderRes = await fetchSupervisorOrders(supabase, null, "");
    setLoading(false);
    if (orderRes.error) setError(orderRes.error);
    setOrders(orderRes.orders);
  }, [supabase]);

  const filteredOrders = useMemo(() => {
    const statusKey = statusFilter?.trim().toLowerCase() ?? "";
    let list = orders;
    if (statusKey) {
      list = list.filter((o) => o.status.trim().toLowerCase() === statusKey);
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((order) => {
      const haystack = [
        order.order_number,
        order.outlet_name,
        order.employee_name ?? "",
        String(order.grand_total),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, query, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack} accessibilityRole="button">
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.lead}>{subtitle}</Text>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search orders…"
        placeholderTextColor="#a8a29e"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#c41e3a" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.order_id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={onOpenOrder ? () => onOpenOrder(item.order_id) : undefined}
            />
          )}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={
            <Text style={styles.empty}>No orders match your search.</Text>
          }
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
    marginBottom: 4,
    textAlign: "center",
  },
  lead: {
    fontSize: 13,
    color: "#57534e",
    marginBottom: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 8,
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
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#78716c", marginTop: 24, fontSize: 14 },
});
