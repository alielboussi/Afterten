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
import { formatKwacha } from "../lib/currency";
import {
  collectCheckableItemIds,
  type OffloadingDisplayGroup,
} from "../lib/offloading-display";
import { confirmOffloadingChecklist, fetchOffloadingOrderDetail } from "../lib/offloading";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onAccepted: () => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

function productLabel(row: OffloadingDisplayGroup["rows"][number]): string {
  if (row.kind === "variant" || row.kind === "auto") return `- ${row.name}`;
  return row.name;
}

export function OffloadingChecklistScreen({
  supabase,
  orderId,
  onBack,
  onAccepted,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [outletName, setOutletName] = useState("");
  const [grandTotal, setGrandTotal] = useState(0);
  const [groups, setGroups] = useState<OffloadingDisplayGroup[]>([]);
  const [allItemIds, setAllItemIds] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { detail, error } = await fetchOffloadingOrderDetail(supabase, orderId);
      if (cancelled) return;
      setLoading(false);
      if (!detail) {
        onToast(error ?? "Could not load order.");
        onBack();
        return;
      }
      setOrderNumber(detail.order_number);
      setOutletName(detail.outlet_name);
      setGrandTotal(detail.grand_total);
      setGroups(detail.groups);
      const ids = collectCheckableItemIds(detail.groups);
      setAllItemIds(ids);
      const frozen = Boolean(detail.offloading_checklist_completed_at);
      setReadOnly(frozen);
      if (frozen) {
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

  function toggleItem(itemId: string | null) {
    if (readOnly || !itemId) return;
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function onAccept() {
    if (readOnly) return;
    if (!allChecked) {
      onToast("There is an item not yet received");
      return;
    }
    setBusy(true);
    const { error } = await confirmOffloadingChecklist(supabase, orderId, allItemIds);
    setBusy(false);
    if (error) {
      onToast(error);
      return;
    }
    onAccepted();
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
        <Text style={styles.backLinkText}>← Offloading</Text>
      </Pressable>
      <Text style={styles.title}>Receive order</Text>
      <Text style={styles.subtitle}>
        {outletName} · {orderNumber}
      </Text>
      {readOnly ? (
        <Text style={styles.frozenNote}>Items accepted — checklist is locked.</Text>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colCheck]} />
            <Text style={[styles.cellHeader, styles.colProduct]}>Product</Text>
            <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.cellHeader, styles.colUom]}>UOM</Text>
            <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
          </View>
          {groups.map((group) => (
            <View key={group.groupKey}>
              {group.rows.map((row) => (
                <View key={row.rowKey} style={styles.tableBodyRow}>
                  {row.item_id ? (
                    <Pressable
                      style={styles.colCheck}
                      onPress={() => toggleItem(row.item_id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(checked[row.item_id!]) }}
                    >
                      <Ionicons
                        name={checked[row.item_id!] ? "checkbox" : "square-outline"}
                        size={22}
                        color={checked[row.item_id!] ? "#047857" : "#78716c"}
                      />
                    </Pressable>
                  ) : (
                    <View style={styles.colCheck} />
                  )}
                  <View style={styles.colProduct}>
                    <Text
                      style={
                        row.kind === "main" || row.kind === "parent"
                          ? styles.cellProductNameMain
                          : styles.cellProductNameSub
                      }
                      numberOfLines={3}
                    >
                      {productLabel(row)}
                    </Text>
                  </View>
                  <Text style={[styles.cellBody, styles.colQty]}>
                    {row.qty != null ? row.qty : ""}
                  </Text>
                  <Text style={[styles.cellBody, styles.colUom]}>{row.uom}</Text>
                  <Text style={[styles.cellBody, styles.colAmount]}>
                    {row.line_total != null && row.line_total > 0
                      ? formatKwacha(row.line_total)
                      : ""}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatKwacha(grandTotal)}</Text>
        </View>

        <Pressable
          style={[styles.acceptBtn, (!allChecked || busy || readOnly) && styles.acceptBtnDisabled]}
          disabled={!allChecked || busy || readOnly}
          onPress={() => void onAccept()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptBtnText}>
              {readOnly ? "Order accepted" : "Accept Order"}
            </Text>
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
  frozenNote: {
    fontSize: 12,
    color: "#047857",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
  },
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
  colProduct: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 8 },
  colQty: { width: 44, flexShrink: 0, textAlign: "center" },
  colUom: { width: 50, flexShrink: 0, textAlign: "center" },
  colAmount: { width: 72, flexShrink: 0, textAlign: "right" },
  cellProductNameMain: { fontSize: 13, fontWeight: "700", color: "#292524" },
  cellProductNameSub: { fontSize: 12, color: "#57534e" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: "700" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#c41e3a" },
  acceptBtn: {
    marginTop: 16,
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  acceptBtnDisabled: { opacity: 0.5 },
  acceptBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
