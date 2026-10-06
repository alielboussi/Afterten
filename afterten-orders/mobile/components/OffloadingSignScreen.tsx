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
import { formatPersonName, formatPersonNameInput, isValidPersonName } from "../lib/person-name";
import { downloadCompletedOrderPdf } from "../lib/completed-order-pdf";
import { completeOutletOrder, fetchOffloadingOrderDetail } from "../lib/offloading";
import {
  enqueueOfflineComplete,
  isLikelyNetworkError,
} from "../lib/offline-complete-queue";
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
  const [receiverName, setReceiverName] = useState("");
  const [signatureValid, setSignatureValid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { detail, error: loadErr } = await fetchOffloadingOrderDetail(supabase, orderId);
      if (cancelled) return;
      setLoading(false);
      if (!detail) {
        setError(loadErr ?? "Could not load order.");
        return;
      }
      if (!detail.offloading_checklist_completed_at) {
        setError("Confirm all items received first.");
        return;
      }
      setOrderNumber(detail.order_number);
      setOutletName(detail.outlet_name);
      setOutletId(detail.outlet_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase]);

  const nameOk = isValidPersonName(receiverName);
  const canComplete = nameOk && signatureValid && !busy;

  async function onCompleteOrder() {
    if (!nameOk) {
      setError("Enter your full name.");
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
    const uploaded = await uploadOffloaderSignature(supabase, outletId, orderId, pngUri);
    if ("error" in uploaded) {
      setBusy(false);
      setError(uploaded.error);
      return;
    }
    const done = await completeOutletOrder(
      supabase,
      orderId,
      formatPersonName(receiverName),
      uploaded.dbPath,
    );
    if (done.error) {
      if (isLikelyNetworkError(done.error)) {
        await enqueueOfflineComplete({
          orderId,
          outletId,
          offloaderName: formatPersonName(receiverName),
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
        <TextInput
          style={styles.nameInput}
          value={receiverName}
          onChangeText={(text) => setReceiverName(formatPersonNameInput(text))}
          onBlur={() => setReceiverName(formatPersonName(receiverName))}
          placeholder="Full name"
          placeholderTextColor="#a8a29e"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Signature</Text>
        <SignaturePad ref={signatureRef} disabled={busy} onValidityChange={setSignatureValid} />

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
