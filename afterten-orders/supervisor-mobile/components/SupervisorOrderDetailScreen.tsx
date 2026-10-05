import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKwacha, formatOrderDate } from "../lib/currency";
import {
  buildSupervisorPreviewGroups,
  fetchOrderRulesContext,
} from "../lib/supervisor-preview-display";
import {
  acceptSupervisorOrder,
  assertSupervisorPayloadMatchesLines,
  buildItemsPayload,
  editableLinesFromDetail,
  fetchSupervisorOrderDetail,
  previewSupervisorOrderRevision,
  type EditableOrderLine,
  type SupervisorPreviewLine,
} from "../lib/supervisor-order-detail";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onAccepted: () => void;
  contentPaddingBottom: number;
};

export function SupervisorOrderDetailScreen({
  supabase,
  orderId,
  onBack,
  onAccepted,
  contentPaddingBottom,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outletName, setOutletName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [editable, setEditable] = useState<EditableOrderLine[]>([]);
  const [previewLines, setPreviewLines] = useState<SupervisorPreviewLine[]>([]);
  const [rulesContext, setRulesContext] = useState<
    Awaited<ReturnType<typeof fetchOrderRulesContext>>
  >({ rules: [], catalogById: new Map() });
  const [grandTotal, setGrandTotal] = useState(0);
  const [variantPickerIndex, setVariantPickerIndex] = useState<number | null>(null);
  /** In-progress qty text so clearing the field does not drop the line from preview. */
  const [qtyDraftByProductId, setQtyDraftByProductId] = useState<Record<string, string>>({});

  const qtyDisplayValue = useCallback(
    (productId: string, numericQty: number) => {
      if (Object.prototype.hasOwnProperty.call(qtyDraftByProductId, productId)) {
        return qtyDraftByProductId[productId];
      }
      return String(numericQty);
    },
    [qtyDraftByProductId],
  );

  const refreshPreview = useCallback(
    async (lines: EditableOrderLine[]) => {
      const payload = buildItemsPayload(lines);
      const payloadErr = assertSupervisorPayloadMatchesLines(lines, payload);
      if (payloadErr) {
        setError(payloadErr);
        return;
      }
      if (payload.length === 0) {
        return;
      }
      const { lines: preview, grandTotal: total, error: previewErr } =
        await previewSupervisorOrderRevision(supabase, orderId, payload);
      if (previewErr) {
        setError(previewErr);
        return;
      }
      setPreviewLines(preview);
      setGrandTotal(total);
    },
    [orderId, supabase],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchOrderRulesContext(supabase).then((ctx) => {
      if (!cancelled) setRulesContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { detail, error: loadErr } = await fetchSupervisorOrderDetail(supabase, orderId);
      if (cancelled) return;
      setLoading(false);
      if (loadErr || !detail) {
        setError(loadErr ?? "Could not load order.");
        return;
      }
      setOutletName(detail.outlet_name);
      setOrderNumber(detail.order_number);
      setCreatedAt(detail.created_at);
      setEmployeeName(detail.employee_name);
      setStatus(detail.status);
      const editLines = editableLinesFromDetail(detail);
      setEditable(editLines);
      await refreshPreview(editLines);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshPreview, supabase]);

  const canAccept = status === "placed" && !busy;

  async function onQtyChange(index: number, text: string) {
    const line = editable[index];
    if (!line) return;
    const cleaned = text.replace(/[^0-9.]/g, "");
    const productId = line.product_id;
    setQtyDraftByProductId((prev) => ({ ...prev, [productId]: cleaned }));

    if (cleaned === "" || cleaned === "." || cleaned === "0") {
      return;
    }

    const qty = Number(cleaned);
    if (!Number.isFinite(qty) || qty < 0) return;

    const next = editable.map((l, i) => (i === index ? { ...l, qty } : l));
    setEditable(next);
    setError(null);
    await refreshPreview(next);
  }

  function onQtyBlur(index: number) {
    const line = editable[index];
    if (!line) return;
    const productId = line.product_id;
    const draft = qtyDraftByProductId[productId];
    setQtyDraftByProductId((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    if (draft === undefined) return;
    if (draft === "" || draft === ".") {
      return;
    }
    const qty = Number(draft);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than zero.");
    }
  }

  async function onPickVariant(index: number, variantId: string, variantName: string) {
    const next = editable.map((line, i) =>
      i === index ? { ...line, product_id: variantId, name: variantName } : line,
    );
    setEditable(next);
    setVariantPickerIndex(null);
    await refreshPreview(next);
  }

  async function onAccept() {
    if (!canAccept) return;
    setBusy(true);
    setError(null);
    const payload = buildItemsPayload(editable);
    const payloadErr = assertSupervisorPayloadMatchesLines(editable, payload);
    if (payloadErr) {
      setBusy(false);
      setError(payloadErr);
      return;
    }
    const { error: acceptErr } = await acceptSupervisorOrder(supabase, orderId, payload);
    setBusy(false);
    if (acceptErr) {
      setError(acceptErr);
      return;
    }
    onAccepted();
  }

  const displayGroups = useMemo(
    () =>
      buildSupervisorPreviewGroups(
        previewLines,
        rulesContext.rules,
        rulesContext.catalogById,
      ),
    [previewLines, rulesContext],
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#c41e3a" />
      </View>
    );
  }

  const pickerLine =
    variantPickerIndex != null && variantPickerIndex >= 0
      ? editable[variantPickerIndex]
      : null;

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack} accessibilityRole="button">
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <Text style={styles.headerLine}>{outletName}</Text>
          <Text style={styles.headerLine}>Order no.: {orderNumber}</Text>
          <Text style={styles.headerLine}>{formatOrderDate(createdAt)} (Kitwe)</Text>
          {employeeName ? (
            <Text style={styles.headerLine}>Placed by {employeeName}</Text>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colProduct]}>Product</Text>
            <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.cellHeader, styles.colUom]}>UOM</Text>
            <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
          </View>

          {displayGroups.map((group) => (
            <View key={group.groupKey}>
              {group.rows.map((row) => {
                const editIndex = editable.findIndex(
                  (e) => e.product_id.toLowerCase() === row.product_id.toLowerCase(),
                );
                const isEditable = row.kind === "main" && editIndex >= 0;
                const qtyLabel =
                  row.kind === "auto"
                    ? Number.isInteger(row.qty)
                      ? String(row.qty)
                      : String(row.qty)
                    : null;

                return (
                  <View key={row.rowKey} style={styles.tableBodyRow}>
                    <View style={styles.colProduct}>
                      <Text
                        style={
                          row.kind === "main" ? styles.cellProductNameMain : styles.cellProductNameAuto
                        }
                        numberOfLines={3}
                      >
                        {row.kind === "auto" ? `- ${row.name}` : row.name}
                      </Text>
                      {isEditable && editable[editIndex]?.variants.length > 0 ? (
                        <Pressable
                          onPress={() => setVariantPickerIndex(editIndex)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.swapLink}>Change variant</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {isEditable ? (
                      <TextInput
                        style={[styles.qtyInput, styles.colQty]}
                        keyboardType="decimal-pad"
                        value={qtyDisplayValue(
                          editable[editIndex]!.product_id,
                          editable[editIndex]?.qty ?? row.qty,
                        )}
                        onChangeText={(t) => void onQtyChange(editIndex, t)}
                        onBlur={() => onQtyBlur(editIndex)}
                      />
                    ) : (
                      <Text style={[styles.cellBody, styles.colQty]}>
                        {row.kind === "main" ? row.qty : qtyLabel}
                      </Text>
                    )}
                    <Text style={[styles.cellBody, styles.colUom]} numberOfLines={2}>
                      {row.uom}
                    </Text>
                    <Text style={[styles.cellBody, styles.colAmount]}>
                      {row.line_total > 0 ? formatKwacha(row.line_total) : ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatKwacha(grandTotal)}</Text>
        </View>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {canAccept ? (
          <Pressable
            style={[styles.acceptBtn, busy && styles.acceptBtnDisabled]}
            disabled={busy}
            onPress={() => void onAccept()}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept order</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={pickerLine != null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose variant</Text>
            {pickerLine?.variants.map((v) => (
              <Pressable
                key={v.variant_id}
                style={styles.modalOption}
                onPress={() =>
                  void onPickVariant(variantPickerIndex as number, v.variant_id, v.name)
                }
              >
                <Text style={styles.modalOptionText}>{v.name}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.modalCancel} onPress={() => setVariantPickerIndex(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  backLink: { marginBottom: 8, alignSelf: "flex-start" },
  backLinkText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  headerBlock: { marginBottom: 12, alignItems: "center" },
  headerLine: { fontSize: 14, color: "#292524", lineHeight: 20, textAlign: "center" },
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
  cellProductNameMain: {
    fontSize: 13,
    fontWeight: "700",
    color: "#292524",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  cellProductNameAuto: {
    fontSize: 12,
    fontWeight: "500",
    color: "#57534e",
    lineHeight: 18,
    paddingLeft: 4,
  },
  colProduct: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 },
  colQty: { width: 52, flexShrink: 0, textAlign: "center", paddingHorizontal: 4 },
  colUom: { width: 58, flexShrink: 0, paddingLeft: 8, textAlign: "center" },
  colAmount: { width: 76, flexShrink: 0, textAlign: "right" },
  qtyInput: {
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 12,
    textAlign: "center",
    backgroundColor: "#fff",
  },
  swapLink: { fontSize: 11, color: "#1e3a8a", fontWeight: "600", marginTop: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#292524" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#c41e3a" },
  error: { color: "#b91c1c", marginBottom: 12, lineHeight: 20 },
  acceptBtn: {
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: "#292524" },
  modalOption: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e7e5e4" },
  modalOptionText: { fontSize: 15, color: "#1e3a8a", fontWeight: "600" },
  modalCancel: { marginTop: 12, alignItems: "center", paddingVertical: 8 },
  modalCancelText: { color: "#57534e", fontWeight: "600" },
});
