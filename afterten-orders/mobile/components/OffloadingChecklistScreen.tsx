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
import { CHECKLIST_ICON_SIZE, checklistStyles as cs } from "./checklist-styles";

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
        <View style={cs.table}>
          <View style={cs.tableHeaderRow}>
            <Text style={[cs.cellHeader, cs.colCheck]} />
            <Text style={[cs.cellHeader, cs.colProduct]}>Product</Text>
            <Text style={[cs.cellHeader, cs.colQty]}>Qty</Text>
            <Text style={[cs.cellHeader, cs.colUom]}>UOM</Text>
            <Text style={[cs.cellHeader, cs.colAmount]}>Amount</Text>
          </View>
          {groups.map((group) => (
            <View key={group.groupKey}>
              {group.rows.map((row) => {
                const canToggle = Boolean(row.item_id) && !readOnly;
                const isChecked = row.item_id ? Boolean(checked[row.item_id]) : false;
                const rowContent = (
                  <>
                    <View style={cs.colCheck}>
                      {row.item_id ? (
                        <Ionicons
                          name={isChecked ? "checkbox" : "square-outline"}
                          size={CHECKLIST_ICON_SIZE}
                          color={isChecked ? "#047857" : "#78716c"}
                        />
                      ) : null}
                    </View>
                    <View style={cs.colProduct}>
                      <Text
                        style={
                          row.kind === "main" || row.kind === "parent"
                            ? cs.cellProductNameMain
                            : cs.cellProductNameSub
                        }
                        numberOfLines={4}
                      >
                        {productLabel(row)}
                      </Text>
                    </View>
                    <Text style={[cs.cellBody, cs.colQty]}>
                      {row.qty != null ? row.qty : ""}
                    </Text>
                    <Text style={[cs.cellBody, cs.colUom]}>{row.uom}</Text>
                    <Text style={[cs.cellBody, cs.colAmount]}>
                      {row.line_total != null && row.line_total > 0
                        ? formatKwacha(row.line_total)
                        : ""}
                    </Text>
                  </>
                );
                if (!row.item_id) {
                  return (
                    <View key={row.rowKey} style={cs.tableBodyRow}>
                      {rowContent}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={row.rowKey}
                    style={cs.tableBodyRow}
                    onPress={() => toggleItem(row.item_id)}
                    disabled={!canToggle}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                  >
                    {rowContent}
                  </Pressable>
                );
              })}
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
