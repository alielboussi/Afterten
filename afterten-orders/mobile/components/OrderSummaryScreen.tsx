import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { OrderSummaryPreview, SummaryDisplayRow } from "../lib/order-summary";
import { formatKitweDateTime, summaryGrandTotal } from "../lib/order-summary";
import { formatKwacha } from "../lib/currency";
import { formatPersonName, formatPersonNameInput, isValidPersonName } from "../lib/person-name";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

type Props = {
  outletName: string;
  outletCode: string;
  preview: OrderSummaryPreview;
  onBack: () => void;
  onSaveOrder: (employeeName: string, signaturePad: SignaturePadHandle) => void;
  saving: boolean;
  saveError: string | null;
  contentPaddingBottom: number;
};

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function renderRow(row: SummaryDisplayRow) {
  const isHeadline = row.kind === "main" || row.kind === "parent";
  const isSubLine = row.kind === "variant" || row.kind === "auto";
  const productLabel = isSubLine ? `- ${row.name}` : row.name;
  const qtyLabel = row.qty != null ? formatQty(row.qty) : "";

  return (
    <View key={row.rowKey} style={styles.tableBodyRow}>
      <View style={styles.colProduct}>
        <Text style={isHeadline ? styles.cellProductNameMain : styles.cellProductNameAuto} numberOfLines={3}>
          {productLabel}
        </Text>
        {row.unitsDetail ? <Text style={styles.cellUnitsMeta}>{row.unitsDetail}</Text> : null}
      </View>
      <Text style={[styles.cellBody, styles.colQty]}>{qtyLabel}</Text>
      <Text style={[styles.cellBody, styles.colUom]} numberOfLines={2}>
        {row.uom}
      </Text>
      <Text style={[styles.cellBody, styles.colAmount]}>
        {row.amount != null ? formatKwacha(row.amount) : ""}
      </Text>
    </View>
  );
}

export function OrderSummaryScreen({
  outletName,
  outletCode,
  preview,
  onBack,
  onSaveOrder,
  saving,
  saveError,
  contentPaddingBottom,
}: Props) {
  const { dateLabel, timeLabel } = formatKitweDateTime();
  const grandTotal = summaryGrandTotal(preview.groups);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [signatureValid, setSignatureValid] = useState(false);

  const nameOk = isValidPersonName(employeeName);
  const canSave = nameOk && signatureValid && !saving;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerBlock}>
        <Text style={styles.headerLine}>{outletName}</Text>
        <Text style={styles.headerLine}>Outlet code: {outletCode}</Text>
        <Text style={styles.headerLine}>Order no.: {preview.orderNumber}</Text>
        <Text style={styles.headerLine}>{dateLabel}</Text>
        <Text style={styles.headerLine}>{timeLabel} (Kitwe)</Text>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.cellHeader, styles.colProduct]}>Product</Text>
          <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
          <Text style={[styles.cellHeader, styles.colUom]}>UOM</Text>
          <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
        </View>

        {preview.groups.map((group) => (
          <View key={group.groupKey}>{group.rows.map((row) => renderRow(row))}</View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatKwacha(grandTotal)}</Text>
      </View>

      <Text style={styles.fieldLabel}>Order Placed By</Text>
      <TextInput
        style={styles.nameInput}
        value={employeeName}
        onChangeText={(text) => setEmployeeName(formatPersonNameInput(text))}
        onBlur={() => setEmployeeName(formatPersonName(employeeName))}
        placeholder="Full name"
        placeholderTextColor="#a8a29e"
        autoCapitalize="words"
        autoCorrect={false}
        editable={!saving}
        accessibilityLabel="Order placed by"
      />

      <SignaturePad
        ref={signatureRef}
        disabled={saving}
        onValidityChange={setSignatureValid}
      />

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

      <Pressable
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        disabled={!canSave}
        onPress={() => {
          const pad = signatureRef.current;
          if (!pad || !nameOk) return;
          if (!pad.isValid()) return;
          void onSaveOrder(employeeName, pad);
        }}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>
            {saveError ? "Retry submit order" : "Save order"}
          </Text>
        )}
      </Pressable>

      {saveError ? (
        <Text style={styles.retryHint}>
          Your cart is unchanged. Fix the issue above and tap Retry until the order is placed.
        </Text>
      ) : null}

      <Pressable style={styles.backBtn} onPress={onBack} disabled={saving} accessibilityRole="button">
        <Text style={[styles.backBtnText, saving && styles.backBtnTextDisabled]}>← Back to order</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingTop: 4 },
  headerBlock: {
    alignItems: "center",
    marginBottom: 20,
    gap: 4,
  },
  headerLine: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1e3a8a",
    textAlign: "center",
  },
  table: {
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f4",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e5e4",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableBodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e7e5e4",
  },
  cellHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#57534e",
    textTransform: "uppercase",
  },
  cellBody: {
    fontSize: 13,
    color: "#292524",
    fontWeight: "500",
  },
  colProduct: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 12 },
  colQty: { width: 52, flexShrink: 0, textAlign: "center", paddingHorizontal: 4 },
  colUom: { width: 58, flexShrink: 0, paddingLeft: 8, textAlign: "center" },
  colAmount: { width: 76, flexShrink: 0, textAlign: "right" },
  cellProductNameMain: {
    fontSize: 13,
    fontWeight: "700",
    color: "#292524",
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  cellProductNameAuto: {
    fontSize: 13,
    fontWeight: "500",
    color: "#44403c",
    lineHeight: 18,
    paddingLeft: 4,
  },
  cellUnitsMeta: {
    fontSize: 10,
    color: "#78716c",
    marginTop: 2,
    lineHeight: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 8,
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#292524" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#c41e3a" },
  fieldLabel: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: "700",
    color: "#292524",
  },
  nameInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#292524",
    backgroundColor: "#fff",
  },
  saveError: {
    marginTop: 12,
    fontSize: 13,
    color: "#b91c1c",
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#c41e3a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  retryHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#57534e",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  backBtn: {
    marginTop: 16,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  backBtnText: { color: "#c41e3a", fontWeight: "600", fontSize: 15 },
  backBtnTextDisabled: { opacity: 0.5 },
});
