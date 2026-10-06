import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import {
  completeDriverHandoff,
  fetchDeliveryDrivers,
  fetchDeliveryLoadingDetail,
  type DeliveryDriver,
} from "../lib/delivery-loading";
import { uploadDriverSignature } from "../lib/driver-signature-upload";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  supervisorLabel: string;
  onBack: () => void;
  onComplete: (message: string) => void;
  contentPaddingBottom: number;
};

export function DeliveryDriverHandoffScreen({
  supabase,
  orderId,
  supervisorLabel,
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
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DeliveryDriver | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signatureValid, setSignatureValid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [detailRes, driversRes] = await Promise.all([
        fetchDeliveryLoadingDetail(supabase, orderId),
        fetchDeliveryDrivers(supabase),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (!detailRes.detail) {
        setError(detailRes.error ?? "Could not load order.");
        return;
      }
      if (!detailRes.detail.loading_checklist_completed_at) {
        setError("Complete the loading checklist first.");
        return;
      }
      setOrderNumber(detailRes.detail.order_number);
      setOutletName(detailRes.detail.outlet_name);
      setOutletId(detailRes.detail.outlet_id);
      setDrivers(driversRes.drivers);
      if (driversRes.error) setError(driversRes.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase]);

  async function onDispatch() {
    if (!selectedDriver) {
      setError("Select a driver.");
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
    const uploaded = await uploadDriverSignature(supabase, outletId, orderId, pngUri, {
      outletName,
      driverName: selectedDriver.name,
      supervisorLabel: supervisorLabel.trim() || "Supervisor",
      orderNumber,
    });
    if ("error" in uploaded) {
      setBusy(false);
      setError(uploaded.error);
      return;
    }
    const handoff = await completeDriverHandoff(
      supabase,
      orderId,
      selectedDriver.id,
      uploaded.dbPath,
    );
    if (handoff.error) {
      setBusy(false);
      setError(handoff.error);
      return;
    }
    setBusy(false);
    onComplete("Order dispatched.");
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
      <Text style={styles.title}>Dispatch order</Text>
      <Text style={styles.subtitle}>
        {outletName} · {orderNumber}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <Text style={styles.fieldLabel}>Driver</Text>
        <Pressable style={styles.selectBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.selectBtnText}>
            {selectedDriver?.name ?? "Select driver…"}
          </Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Driver signature</Text>
        <SignaturePad ref={signatureRef} disabled={busy} onValidityChange={setSignatureValid} />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          style={[
            styles.saveBtn,
            (busy || !selectedDriver || !signatureValid) && styles.saveBtnDisabled,
          ]}
          disabled={busy || !selectedDriver || !signatureValid}
          onPress={() => void onDispatch()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Dispatch</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select driver</Text>
            {drivers.length === 0 ? (
              <Text style={styles.modalEmpty}>No drivers yet. Add names in the web portal.</Text>
            ) : (
              drivers.map((d) => (
                <Pressable
                  key={d.id}
                  style={styles.modalOption}
                  onPress={() => {
                    setSelectedDriver(d);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{d.name}</Text>
                </Pressable>
              ))
            )}
            <Pressable style={styles.modalCancel} onPress={() => setPickerOpen(false)}>
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
  title: { fontSize: 20, fontWeight: "700", color: "#1e3a8a", textAlign: "center" },
  subtitle: { fontSize: 13, color: "#57534e", textAlign: "center", marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: "#292524", marginTop: 12 },
  selectBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  selectBtnText: { fontSize: 15, color: "#292524" },
  error: { color: "#b91c1c", marginTop: 12, lineHeight: 20 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  modalEmpty: { color: "#57534e", marginVertical: 8 },
  modalOption: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e5e4",
  },
  modalOptionText: { fontSize: 15, color: "#1e3a8a", fontWeight: "600" },
  modalCancel: { marginTop: 12, alignItems: "center", paddingVertical: 8 },
  modalCancelText: { color: "#57534e", fontWeight: "600" },
});
