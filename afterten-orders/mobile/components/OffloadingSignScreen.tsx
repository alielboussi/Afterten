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
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { downloadCompletedOrderPdf } from "../lib/completed-order-pdf";
import { completeOutletOrder, fetchOffloadingOrderDetail } from "../lib/offloading";
import {
  enqueueOfflineComplete,
  isLikelyNetworkError,
} from "../lib/offline-complete-queue";
import { fetchOutletEmployeesForApp, type OutletEmployeeOption } from "../lib/outlet-employees";
import { verifyOutletEmployeePasscode } from "../lib/verify-outlet-employee-passcode";
import { uploadOffloaderSignature } from "../lib/signature-upload";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onComplete: (message: string) => void;
  contentPaddingBottom: number;
};

export function OffloadingSignScreen({
  supabase,
  orderId,
  onBack,
  onComplete,
  contentPaddingBottom,
}: Props) {
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [outletName, setOutletName] = useState("");
  const [outletId, setOutletId] = useState("");
  const [supervisorLabel, setSupervisorLabel] = useState("Supervisor");
  const [employees, setEmployees] = useState<OutletEmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");
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
    if (result.displayName) {
      setSelectedEmployeeName(result.displayName);
    }
    setPasscodeVerified(true);
    setPasscodeVerifyError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [detailRes, empRes] = await Promise.all([
        fetchOffloadingOrderDetail(supabase, orderId),
        fetchOutletEmployeesForApp(supabase),
      ]);
      if (cancelled) return;
      setLoading(false);
      setEmployeesLoading(false);
      if (!detailRes.detail) {
        setError(detailRes.error ?? "Could not load order.");
        return;
      }
      if (!detailRes.detail.offloading_checklist_completed_at) {
        setError("Confirm all items received first.");
        return;
      }
      setOrderNumber(detailRes.detail.order_number);
      setOutletName(detailRes.detail.outlet_name);
      setOutletId(detailRes.detail.outlet_id);
      setSupervisorLabel(detailRes.detail.supervisor_accepted_alias?.trim() || "Supervisor");
      if (empRes.ok) {
        setEmployees(empRes.employees);
        if (empRes.employees.length === 1) {
          setSelectedEmployeeId(empRes.employees[0].id);
          setSelectedEmployeeName(empRes.employees[0].displayName);
        }
      } else {
        setError(empRes.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase]);

  const passcodeOk = passcodeVerified;
  const employeeOk = Boolean(selectedEmployeeId);
  const canComplete = employeeOk && passcodeOk && signatureValid && !busy && !passcodeVerifying;

  async function onCompleteOrder() {
    if (!selectedEmployeeId) {
      setError("Select an employee.");
      return;
    }
    if (!signatureRef.current?.isValid()) {
      setError(signatureRef.current?.validationMessage() ?? "Please sign in the box.");
      return;
    }
    setBusy(true);
    setError(null);
    const pngUri = await signatureRef.current.capturePngUri();
    if (!pngUri) {
      setBusy(false);
      setError("Could not read signature.");
      return;
    }
    const uploaded = await uploadOffloaderSignature(supabase, outletId, orderId, pngUri, {
      outletName,
      offloaderName: selectedEmployeeName,
      supervisorLabel,
      orderNumber,
    });
    if ("error" in uploaded) {
      setBusy(false);
      setError(uploaded.error);
      return;
    }
    const done = await completeOutletOrder(
      supabase,
      orderId,
      selectedEmployeeId,
      passcode.trim(),
      uploaded.dbPath,
    );
    if (done.error) {
      if (isLikelyNetworkError(done.error)) {
        await enqueueOfflineComplete({
          orderId,
          outletId,
          outletEmployeeId: selectedEmployeeId,
          employeePasscode: passcode.trim(),
          offloaderName: selectedEmployeeName,
          supervisorLabel,
          orderNumber,
          outletName,
          signatureLocalUri: pngUri,
        });
        setBusy(false);
        onComplete("Saved offline — will complete when connection returns.");
        return;
      }
      setBusy(false);
      setError(done.error);
      return;
    }
    const pdf = await downloadCompletedOrderPdf(supabase, orderId);
    setBusy(false);
    onComplete(
      pdf.ok
        ? `Order completed. Full PDF: ${pdf.fileName}`
        : `Order completed. PDF: ${pdf.error}`,
    );
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
      <Text style={styles.title}>Complete order</Text>
      <Text style={styles.subtitle}>
        {outletName} · {orderNumber}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <Text style={styles.fieldLabel}>Received by</Text>
        {employeesLoading ? (
          <ActivityIndicator color="#c41e3a" />
        ) : employees.length === 0 ? (
          <Text style={styles.error}>No employees configured in the portal.</Text>
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
                    setSelectedEmployeeName(emp.displayName);
                    setPasscode("");
                    resetPasscodeVerification();
                  }}
                  disabled={busy}
                >
                  <Text style={[styles.employeeText, selected && styles.employeeTextSelected]}>
                    {emp.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedEmployeeId ? (
          <>
            <Text style={styles.fieldLabel}>Passcode</Text>
            <TextInput
              style={styles.nameInput}
              value={passcode}
              onChangeText={(text) => {
                setPasscode(text);
                resetPasscodeVerification();
              }}
              onBlur={() => void verifyPasscodeForSelectedEmployee()}
              secureTextEntry
              keyboardType="number-pad"
              editable={!busy && !passcodeVerifying}
              placeholder="Enter passcode"
              placeholderTextColor="#a8a29e"
            />
            {passcodeVerifying ? <ActivityIndicator style={{ marginTop: 8 }} color="#c41e3a" /> : null}
            {passcodeVerifyError ? (
              <Text style={styles.error}>{passcodeVerifyError}</Text>
            ) : passcodeVerified ? (
              <Text style={styles.passcodeOkHint}>Passcode accepted — you may sign below.</Text>
            ) : passcode.trim().length >= 4 ? (
              <Text style={styles.hintMuted}>Leave the field to verify your passcode.</Text>
            ) : null}
          </>
        ) : null}

        {passcodeVerified ? (
          <>
            <Text style={styles.fieldLabel}>Signature</Text>
            <SignaturePad ref={signatureRef} disabled={busy} onValidityChange={setSignatureValid} />
          </>
        ) : (
          <Text style={styles.signatureLocked}>
            Select an employee and enter a valid passcode before signing.
          </Text>
        )}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          style={[styles.completeBtn, !canComplete && styles.completeBtnDisabled]}
          disabled={!canComplete}
          onPress={() => void onCompleteOrder()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.completeBtnText}>Complete Order</Text>
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
  fieldLabel: { fontSize: 14, fontWeight: "700", color: "#292524", marginTop: 12 },
  employeeList: {
    marginTop: 8,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    overflow: "hidden",
  },
  employeeRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e7e5e4",
  },
  employeeRowSelected: { backgroundColor: "#fef2f2" },
  employeeText: { fontSize: 15, color: "#292524" },
  employeeTextSelected: { color: "#c41e3a", fontWeight: "700" },
  nameInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  error: { color: "#b91c1c", marginTop: 12, lineHeight: 20 },
  hintMuted: { marginTop: 8, fontSize: 12, color: "#78716c" },
  passcodeOkHint: { marginTop: 8, fontSize: 13, color: "#166534", fontWeight: "600" },
  signatureLocked: {
    marginTop: 16,
    fontSize: 13,
    color: "#78716c",
    textAlign: "center",
    lineHeight: 18,
  },
  completeBtn: {
    marginTop: 20,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  completeBtnDisabled: { opacity: 0.5 },
  completeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
