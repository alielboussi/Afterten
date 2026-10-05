import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLoadingChecklistGroupsFromLines,
  confirmLoadingChecklist,
  fetchDeliveryLoadingDetail,
  fetchOrderRulesContext,
} from "../lib/delivery-loading";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onConfirmed: () => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

export function DeliveryLoadingChecklistScreen({
  supabase,
  orderId,
  onBack,
  onConfirmed,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [outletName, setOutletName] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [allItemIds, setAllItemIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<
    ReturnType<typeof buildLoadingChecklistGroupsFromLines>
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [detailRes, rulesCtx] = await Promise.all([
        fetchDeliveryLoadingDetail(supabase, orderId),
        fetchOrderRulesContext(supabase),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (!detailRes.detail) {
        onToast(detailRes.error ?? "Could not load order.");
        onBack();
        return;
      }
      setOrderNumber(detailRes.detail.order_number);
      setOutletName(detailRes.detail.outlet_name);
      const built = buildLoadingChecklistGroupsFromLines(detailRes.detail.lines, rulesCtx);
      setGroups(built);
      const ids = detailRes.detail.lines.map((l) => l.item_id).filter(Boolean);
      setAllItemIds(ids);
      if (detailRes.detail.loading_checklist_completed_at) {
        setChecked(Object.fromEntries(ids.map((id) => [id, true])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase, onBack, onToast]);

  const allChecked = useMemo(
    () => allItemIds.length > 0 && allItemIds.every((id) => checked[id]),
    [allItemIds, checked],
  );

  function toggleItem(itemId: string) {
    if (!itemId) return;
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function onConfirm() {
    if (!allChecked) {
      onToast("There is an item not yet loaded");
      return;
    }
    setBusy(true);
    const { error } = await confirmLoadingChecklist(supabase, orderId, allItemIds);
    setBusy(false);
    if (error) {
      onToast(error);
      return;
    }
    onConfirmed();
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#c41e3a" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Confirm loading</Text>
      <Text style={styles.subtitle}>
        {outletName} · {orderNumber}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colCheck]} />
            <Text style={[styles.cellHeader, styles.colProduct]}>Product</Text>
            <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.cellHeader, styles.colUom]}>UOM</Text>
          </View>
          {groups.map((group) => (
            <View key={group.groupKey}>
              {group.rows.map((row) => (
                <View key={row.rowKey} style={styles.tableBodyRow}>
                  <Pressable
                    style={styles.colCheck}
                    onPress={() => toggleItem(row.item_id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: Boolean(checked[row.item_id]) }}
                  >
                    <Ionicons
                      name={checked[row.item_id] ? "checkbox" : "square-outline"}
                      size={22}
                      color={checked[row.item_id] ? "#047857" : "#78716c"}
                    />
                  </Pressable>
                  <View style={styles.colProduct}>
                    <Text
                      style={
                        row.kind === "main" ? styles.cellProductNameMain : styles.cellProductNameAuto
                      }
                      numberOfLines={3}
                    >
                      {row.kind === "auto" ? `- ${row.name}` : row.name}
                    </Text>
                  </View>
                  <Text style={[styles.cellBody, styles.colQty]}>{row.qty}</Text>
                  <Text style={[styles.cellBody, styles.colUom]}>{row.uom}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
          disabled={busy}
          onPress={() => void onConfirm()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmBtnText}>Confirm Loading</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  backLink: { marginBottom: 8, alignSelf: "flex-start" },
  backLinkText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  title: { fontSize: 20, fontWeight: "700", color: "#1e3a8a", textAlign: "center" },
  subtitle: { fontSize: 13, color: "#57534e", textAlign: "center", marginBottom: 12 },
  table: { borderWidth: 1, borderColor: "#e7e5e4", borderRadius: 10, overflow: "hidden" },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f4",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tableBodyRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
    alignItems: "center",
  },
  cellHeader: { fontSize: 11, fontWeight: "700", color: "#57534e" },
  cellBody: { fontSize: 12, color: "#292524" },
  colCheck: { width: 32, alignItems: "center" },
  colProduct: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 },
  colQty: { width: 52, flexShrink: 0, textAlign: "center", paddingHorizontal: 4 },
  colUom: { width: 58, flexShrink: 0, paddingLeft: 8, textAlign: "center" },
  cellProductNameMain: {
    fontSize: 13,
    fontWeight: "700",
    color: "#292524",
    textDecorationLine: "underline",
  },
  cellProductNameAuto: { fontSize: 12, color: "#57534e", paddingLeft: 4 },
  confirmBtn: {
    marginTop: 16,
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
