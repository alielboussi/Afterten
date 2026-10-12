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
import { CHECKLIST_ICON_SIZE, checklistStyles as cs } from "./checklist-styles";

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
  const [readOnly, setReadOnly] = useState(false);
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
      const frozen = Boolean(detailRes.detail.loading_checklist_completed_at);
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

  function toggleItem(itemId: string) {
    if (readOnly || !itemId) return;
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function onConfirm() {
    if (readOnly) return;
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
      {readOnly ? (
        <Text style={styles.frozenNote}>Loading confirmed — checklist is locked.</Text>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <View style={cs.table}>
          <View style={cs.tableHeaderRow}>
            <Text style={[cs.cellHeader, cs.colCheck]} />
            <Text style={[cs.cellHeader, cs.colProduct]}>Product</Text>
            <Text style={[cs.cellHeader, cs.colQty]}>Qty</Text>
            <Text style={[cs.cellHeader, cs.colUom]}>UOM</Text>
          </View>
          {groups.map((group) => (
            <View key={group.groupKey}>
              {group.rows.map((row) => {
                const isChecked = Boolean(checked[row.item_id]);
                return (
                  <Pressable
                    key={row.rowKey}
                    style={cs.tableBodyRow}
                    onPress={() => toggleItem(row.item_id)}
                    disabled={readOnly}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                  >
                    <View style={cs.colCheck}>
                      <Ionicons
                        name={isChecked ? "checkbox" : "square-outline"}
                        size={CHECKLIST_ICON_SIZE}
                        color={isChecked ? "#047857" : "#78716c"}
                      />
                    </View>
                    <View style={cs.colProduct}>
                      <Text
                        style={
                          row.kind === "main" ? cs.cellProductNameMain : cs.cellProductNameAuto
                        }
                        numberOfLines={4}
                      >
                        {row.kind === "auto" ? `- ${row.name}` : row.name}
                      </Text>
                    </View>
                    <Text style={[cs.cellBody, cs.colQty]}>{row.qty}</Text>
                    <Text style={[cs.cellBody, cs.colUom]}>{row.uom}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.confirmBtn, (busy || readOnly || !allChecked) && styles.confirmBtnDisabled]}
          disabled={busy || readOnly || !allChecked}
          onPress={() => void onConfirm()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmBtnText}>
              {readOnly ? "Loading confirmed" : "Confirm Loading"}
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
