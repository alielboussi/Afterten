import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderSummaryPreview, SummaryDisplayRow } from "../lib/order-summary";
import { formatKitweDateTime, summaryGrandTotal } from "../lib/order-summary";
import { formatKwacha } from "../lib/currency";
import { fetchOutletEmployeesForApp, type OutletEmployeeOption } from "../lib/outlet-employees";
import { verifyOutletEmployeePasscode } from "../lib/verify-outlet-employee-passcode";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

type Props = {
  supabase: SupabaseClient;
  outletName: string;
  outletCode: string;
  preview: OrderSummaryPreview;
  onBack: () => void;
  onSaveOrder: (
    outletEmployeeId: string,
    employeePasscode: string,
    signaturePad: SignaturePadHandle,
  ) => void;
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
  supabase,
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
  const [employees, setEmployees] = useState<OutletEmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [passcodeVerified, setPasscodeVerified] = useState(false);
  const [passcodeVerifyError, setPasscodeVerifyError] = useState<string | null>(null);
  const [passcodeVerifying, setPasscodeVerifying] = useState(false);
  const [signatureValid, setSignatureValid] = useState(false);

  function resetPasscodeVerification() {
    setPasscodeVerified(false);
    setPasscodeVerifyError(null);
    setSignatureValid(false);
    signatureRef.current?.clear();
  }

  async function verifyPasscodeForSelectedEmployee() {
    if (!selectedEmployeeId || passcode.trim().length < 4) {
      resetPasscodeVerification();
      return;
    }
    setPasscodeVerifying(true);
    setPasscodeVerifyError(null);
    const result = await verifyOutletEmployeePasscode(supabase, selectedEmployeeId, passcode);
    setPasscodeVerifying(false);
    if (!result.ok) {
      resetPasscodeVerification();
      setPasscodeVerifyError(result.error);
      return;
    }
    setPasscodeVerified(true);
    setPasscodeVerifyError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setEmployeesLoading(true);
    setEmployeesError(null);
    void fetchOutletEmployeesForApp(supabase).then((result) => {
      if (cancelled) return;
      setEmployeesLoading(false);
      if (!result.ok) {
        setEmployeesError(result.error);
        setEmployees([]);
        return;
      }
      setEmployees(result.employees);
      if (result.employees.length === 1) {
        setSelectedEmployeeId(result.employees[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const passcodeOk = passcodeVerified;
  const employeeOk = Boolean(selectedEmployeeId);
  const canSave = employeeOk && passcodeOk && signatureValid && !saving && !employeesLoading && !passcodeVerifying;

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

      <Text style={styles.fieldLabel}>Order placed by</Text>
      {employeesLoading ? (
        <ActivityIndicator style={styles.employeeLoader} color="#c41e3a" />
      ) : employeesError ? (
        <Text style={styles.employeeHintErr}>{employeesError}</Text>
      ) : employees.length === 0 ? (
        <Text style={styles.employeeHintErr}>
          No employees configured. Ask your admin to add staff under Outlet Users → Employees.
        </Text>
      ) : (
        <View style={styles.employeeList}>
          {employees.map((emp) => {
            const selected = emp.id === selectedEmployeeId;
            return (
              <Pressable
                key={emp.id}
                style={[styles.employeeRow, selected && styles.employeeRowSelected]}
                onPress={() => {
                  setSelectedEmployeeId(emp.id);
                  setPasscode("");
                  resetPasscodeVerification();
                }}
                disabled={saving}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.employeeRowText, selected && styles.employeeRowTextSelected]}>
                  {emp.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedEmployeeId ? (
        <>
          <Text style={styles.fieldLabel}>Employee passcode</Text>
          <TextInput
            style={styles.nameInput}
            value={passcode}
            onChangeText={(text) => {
              setPasscode(text);
              resetPasscodeVerification();
            }}
            onBlur={() => void verifyPasscodeForSelectedEmployee()}
            placeholder="Enter passcode"
            placeholderTextColor="#a8a29e"
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="off"
            editable={!saving && !passcodeVerifying}
            accessibilityLabel="Employee passcode"
          />
          {passcodeVerifying ? (
            <ActivityIndicator style={{ marginTop: 8 }} color="#c41e3a" />
          ) : null}
          {passcodeVerifyError ? (
            <Text style={styles.employeeHintErr}>{passcodeVerifyError}</Text>
          ) : passcodeVerified ? (
            <Text style={styles.passcodeOkHint}>Passcode accepted — you may sign below.</Text>
          ) : passcode.trim().length >= 4 ? (
            <Text style={styles.employeeHintMuted}>Leave the field to verify your passcode.</Text>
          ) : null}
        </>
      ) : null}

      {passcodeVerified ? (
        <SignaturePad
          ref={signatureRef}
          disabled={saving}
          onValidityChange={setSignatureValid}
        />
      ) : (
        <Text style={styles.signatureLocked}>
          Select an employee and enter a valid passcode before signing.
        </Text>
      )}

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

      <Pressable
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        disabled={!canSave}
        onPress={() => {
          const pad = signatureRef.current;
          if (!pad || !selectedEmployeeId || !passcodeOk) return;
          if (!pad.isValid()) return;
          void onSaveOrder(selectedEmployeeId, passcode.trim(), pad);
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
  employeeLoader: { marginTop: 12 },
  employeeHintErr: {
    marginTop: 8,
    fontSize: 13,
    color: "#b91c1c",
    lineHeight: 18,
  },
  employeeHintMuted: {
    marginTop: 8,
    fontSize: 12,
    color: "#78716c",
    lineHeight: 17,
  },
  passcodeOkHint: {
    marginTop: 8,
    fontSize: 13,
    color: "#166534",
    fontWeight: "600",
  },
  signatureLocked: {
    marginTop: 20,
    fontSize: 13,
    color: "#78716c",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  employeeList: {
    marginTop: 8,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  employeeRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e7e5e4",
  },
  employeeRowSelected: {
    backgroundColor: "#fef2f2",
  },
  employeeRowText: {
    fontSize: 15,
    color: "#292524",
    fontWeight: "500",
  },
  employeeRowTextSelected: {
    color: "#c41e3a",
    fontWeight: "700",
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
