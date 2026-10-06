import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptSupervisorReturn,
  fetchSupervisorReturnDetail,
  loadReturnStorageImageUrl,
  rejectSupervisorReturn,
  type SupervisorReturnDetail,
} from "../lib/supervisor-returns";

type Props = {
  supabase: SupabaseClient;
  returnId: string;
  onBack: () => void;
  onDecided: (message: string) => void;
  contentPaddingBottom: number;
};

export function SupervisorReturnDetailScreen({
  supabase,
  returnId,
  onBack,
  onDecided,
  contentPaddingBottom,
}: Props) {
  const [detail, setDetail] = useState<SupervisorReturnDetail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSupervisorReturnDetail(supabase, returnId).then(async (result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setDetail(result.detail);
      const url = await loadReturnStorageImageUrl(supabase, result.detail.photoPath);
      if (!cancelled) {
        setPhotoUrl(url);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, returnId]);

  async function decide(kind: "accept" | "reject") {
    if (!detail || busy) return;
    setBusy(true);
    setError(null);
    const result =
      kind === "accept"
        ? await acceptSupervisorReturn(supabase, returnId)
        : await rejectSupervisorReturn(supabase, returnId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDecided(kind === "accept" ? "Return accepted." : "Return rejected.");
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#c41e3a" />;
  }

  if (!detail) {
    return (
      <View>
        <Text style={styles.err}>{error ?? "Return not found."}</Text>
        <Pressable onPress={onBack}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  const decided = detail.status !== "submitted";

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
      <Pressable onPress={onBack}>
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Return #{detail.returnNumber}</Text>
      <Text style={styles.meta}>{detail.outletName}</Text>
      <Text style={styles.meta}>{detail.employeeName}</Text>
      <Text style={styles.status}>
        {detail.status === "accepted"
          ? "Accepted"
          : detail.status === "rejected"
            ? "Rejected"
            : "Awaiting decision"}
      </Text>

      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.photo} accessibilityLabel="Return photo" />
      ) : (
        <Text style={styles.meta}>Photo unavailable.</Text>
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {!decided ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.acceptBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void decide("accept")}
          >
            <Text style={styles.acceptBtnText}>Accept return</Text>
          </Pressable>
          <Pressable
            style={[styles.rejectBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void decide("reject")}
          >
            <Text style={styles.rejectBtnText}>Reject return</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backLinkText: { color: "#c41e3a", fontWeight: "600", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  meta: { marginTop: 6, textAlign: "center", color: "#57534e" },
  status: { marginTop: 10, textAlign: "center", fontWeight: "700", color: "#c41e3a" },
  photo: {
    marginTop: 16,
    width: "100%",
    height: 280,
    borderRadius: 12,
    backgroundColor: "#f5f5f4",
  },
  err: { marginTop: 12, color: "#b91c1c", textAlign: "center" },
  actions: { marginTop: 24, gap: 12 },
  acceptBtn: {
    backgroundColor: "#166534",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "700" },
  rejectBtn: {
    borderWidth: 1,
    borderColor: "#c41e3a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  rejectBtnText: { color: "#c41e3a", fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
});
