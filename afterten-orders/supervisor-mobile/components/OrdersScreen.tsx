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
import { DeliveryLoadingOrderCard } from "./DeliveryLoadingOrderCard";

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  contentPaddingBottom: number;
  onOpenOrder?: (orderId: string) => void;
  statusFilter?: string | null;
  refreshToken?: number;
  title?: string;
  subtitle?: string;
  deliveryLoadingMode?: boolean;
  onOpenLoadingChecklist?: (orderId: string) => void;
  onOpenDriverHandoff?: (orderId: string) => void;
  onDeliveryToast?: (message: string) => void;
};

export function OrdersScreen({
  supabase,
  onBack,
  contentPaddingBottom,
  onOpenOrder,
  statusFilter = "placed",
  refreshToken = 0,
  title = "View orders",
  subtitle = "Search by order number, outlet name, date, amount, or placed-by name.",
  deliveryLoadingMode = false,
  onOpenLoadingChecklist,
  onOpenDriverHandoff,
  onDeliveryToast,
}: Props) {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<SupervisorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const orderRes = await fetchSupervisorOrders(supabase, null, query, statusFilter);
    setLoading(false);
    if (orderRes.error) setError(orderRes.error);
    setOrders(orderRes.orders);
  }, [supabase, query, statusFilter]);

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
  }, [load, refreshToken]);

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
          renderItem={({ item }) =>
            deliveryLoadingMode ? (
              <DeliveryLoadingOrderCard
                order={item}
                onChecklistPress={() => onOpenLoadingChecklist?.(item.order_id)}
                onSignaturePress={() => onOpenDriverHandoff?.(item.order_id)}
                onSignatureBlocked={() =>
                  onDeliveryToast?.("Complete the loading checklist first.")
                }
              />
            ) : (
              <OrderCard
                order={item}
                onPress={onOpenOrder ? () => onOpenOrder(item.order_id) : undefined}
              />
            )
          }
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
