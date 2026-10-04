import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOutletFilters,
  fetchSupervisorOrders,
  type OutletFilterOption,
  type SupervisorOrderRow,
} from "../lib/supabase";
import { OrderCard } from "./OrderCard";

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  contentPaddingBottom: number;
};

export function OrdersScreen({ supabase, onBack, contentPaddingBottom }: Props) {
  const [outlets, setOutlets] = useState<OutletFilterOption[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<SupervisorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [outletRes, orderRes] = await Promise.all([
      fetchOutletFilters(supabase),
      fetchSupervisorOrders(supabase, selectedOutletId, ""),
    ]);
    setLoading(false);
    if (outletRes.error) setError(outletRes.error);
    else if (orderRes.error) setError(orderRes.error);
    setOutlets(outletRes.outlets);
    setOrders(orderRes.orders);
  }, [supabase, selectedOutletId]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => {
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
  }, [orders, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const outletChips = useMemo(
    () => [{ outlet_id: "", outlet_name: "All outlets" }, ...outlets],
    [outlets],
  );

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack} accessibilityRole="button">
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>View orders</Text>
      <Text style={styles.lead}>
        Search by order number, outlet name, date, amount, or placed-by name.
      </Text>

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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {outletChips.map((o) => {
          const active = (selectedOutletId ?? "") === o.outlet_id;
          return (
            <Pressable
              key={o.outlet_id || "all"}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedOutletId(o.outlet_id ? o.outlet_id : null)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.outlet_name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#c41e3a" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.order_id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={
            <Text style={styles.empty}>No orders match your filters.</Text>
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
  title: { fontSize: 22, fontWeight: "700", color: "#1e3a8a", marginBottom: 4 },
  lead: { fontSize: 13, color: "#57534e", marginBottom: 12, lineHeight: 18 },
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
  chipScroll: { maxHeight: 44, marginBottom: 12 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#1e3a8a", borderColor: "#1e3a8a" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#44403c" },
  chipTextActive: { color: "#fff" },
  error: { color: "#b91c1c", marginBottom: 8 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#78716c", marginTop: 24, fontSize: 14 },
});
