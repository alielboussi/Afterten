import { useEffect, useState } from "react";
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
import { downloadCompletedOrderPdf } from "../lib/completed-order-pdf";
import {
  fetchCompletedOrderTimeline,
  formatKwacha,
  formatTimelineWhen,
} from "../lib/completed-order-timeline";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

type Step = {
  key: string;
  title: string;
  when: string;
  who: string | null;
};

export function CompletedOrderDetailScreen({
  supabase,
  orderId,
  onBack,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState({ orderNumber: "", outletName: "", total: 0 });
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { timeline, error: loadErr } = await fetchCompletedOrderTimeline(supabase, orderId);
      if (cancelled) return;
      setLoading(false);
      if (!timeline) {
        setError(loadErr ?? "Could not load order.");
        return;
      }
      setHeader({
        orderNumber: timeline.order_number,
        outletName: timeline.outlet_name,
        total: timeline.grand_total,
      });
      setSteps([
        {
          key: "placed",
          title: "Placed",
          when: formatTimelineWhen(timeline.placed_at),
          who: timeline.placed_by,
        },
        {
          key: "accepted",
          title: "Accepted",
          when: formatTimelineWhen(timeline.accepted_at),
          who: timeline.accepted_by,
        },
        {
          key: "dispatched",
          title: "Dispatched",
          when: formatTimelineWhen(timeline.dispatched_at),
          who: timeline.dispatched_by,
        },
        {
          key: "received",
          title: "Received",
          when: formatTimelineWhen(timeline.received_at),
          who: timeline.received_by,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase]);

  async function onPdf() {
    setPdfBusy(true);
    onToast("Preparing full order PDF…");
    const result = await downloadCompletedOrderPdf(supabase, orderId);
    setPdfBusy(false);
    onToast(result.ok ? `Downloaded ${result.fileName}` : result.error);
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
      <View style={styles.topRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>
        <Pressable onPress={() => void onPdf()} hitSlop={8} accessibilityLabel="Download PDF">
          {pdfBusy ? (
            <ActivityIndicator size="small" color="#1e3a8a" />
          ) : (
            <Ionicons name="document-outline" size={28} color="#1e3a8a" />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <Text style={styles.title}>{header.outletName}</Text>
        <Text style={styles.subtitle}>{header.orderNumber}</Text>
        <Text style={styles.total}>{formatKwacha(header.total)}</Text>

        <Text style={styles.sectionTitle}>Order timeline</Text>
        {steps.map((step, index) => (
          <View key={step.key} style={styles.stepRow}>
            <View style={styles.stepRail}>
              <View style={[styles.dot, index <= steps.length - 1 ? styles.dotDone : null]} />
              {index < steps.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepWhen}>{step.when}</Text>
              {step.who ? <Text style={styles.stepWho}>{step.who}</Text> : null}
            </View>
          </View>
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  backLinkText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  title: { fontSize: 18, fontWeight: "700", color: "#292524", textAlign: "center" },
  subtitle: { fontSize: 15, fontWeight: "700", color: "#1e3a8a", textAlign: "center", marginTop: 4 },
  total: {
    fontSize: 17,
    fontWeight: "700",
    color: "#c41e3a",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#57534e", marginBottom: 12 },
  stepRow: { flexDirection: "row", marginBottom: 4 },
  stepRail: { width: 28, alignItems: "center" },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#a8a29e",
    marginTop: 4,
  },
  dotDone: { backgroundColor: "#047857" },
  line: { flex: 1, width: 2, backgroundColor: "#d6d3d1", marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: 14 },
  stepTitle: { fontSize: 15, fontWeight: "700", color: "#292524" },
  stepWhen: { fontSize: 12, color: "#57534e", marginTop: 2 },
  stepWho: { fontSize: 13, color: "#1e3a8a", marginTop: 2, fontWeight: "600" },
  error: { color: "#b91c1c", marginTop: 12 },
});
