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
import { formatKwacha, formatOrderDate } from "../lib/currency";
import { downloadApprovedOrderPdf } from "../lib/approved-order-pdf";

type Props = {
  supabase: SupabaseClient;
  orderId: string;
  onBack: () => void;
  onToast: (message: string) => void;
  contentPaddingBottom: number;
};

type LineRow = { name: string; qty: number; uom: string; line_total: number; is_auto: boolean };

export function OutletAcceptedOrderDetailScreen({
  supabase,
  orderId,
  onBack,
  onToast,
  contentPaddingBottom,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [outletName, setOutletName] = useState("");
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState("");
  const [grandTotal, setGrandTotal] = useState(0);
  const [lines, setLines] = useState<LineRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: rpcErr } = await supabase.rpc("get_outlet_accepted_order_detail", {
        p_order_id: orderId,
      });
      if (cancelled) return;
      setLoading(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      const o = data as Record<string, unknown>;
      setOrderNumber(String(o.order_number ?? ""));
      setOutletName(String(o.outlet_name ?? ""));
      setEmployeeName(o.employee_name != null ? String(o.employee_name) : null);
      setAcceptedAt(String(o.supervisor_accepted_at ?? o.created_at ?? ""));
      setGrandTotal(Number(o.grand_total ?? 0));
      const rawLines = Array.isArray(o.lines) ? o.lines : [];
      setLines(
        rawLines.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            name: String(r.name ?? ""),
            qty: Number(r.qty ?? 0),
            uom: String(r.uom ?? ""),
            line_total: Number(r.line_total ?? 0),
            is_auto: Boolean(r.is_auto),
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, supabase]);

  async function onPdf() {
    setPdfBusy(true);
    onToast("Preparing PDF…");
    const result = await downloadApprovedOrderPdf(supabase, orderId);
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
            <Ionicons name="document-outline" size={26} color="#1e3a8a" />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: contentPaddingBottom }}>
        <View style={styles.headerBlock}>
          <Text style={styles.headerLine}>{outletName}</Text>
          <Text style={styles.headerLine}>Order no.: {orderNumber}</Text>
          <Text style={styles.headerLine}>{formatOrderDate(acceptedAt)} (Kitwe)</Text>
          {employeeName ? <Text style={styles.headerLine}>Placed by {employeeName}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellHeader, styles.colProduct]}>Product</Text>
            <Text style={[styles.cellHeader, styles.colQty]}>Qty</Text>
            <Text style={[styles.cellHeader, styles.colUom]}>UOM</Text>
            <Text style={[styles.cellHeader, styles.colAmount]}>Amount</Text>
          </View>
          {lines.map((row, idx) => (
            <View key={`${row.name}-${idx}`} style={styles.tableBodyRow}>
              <Text style={[styles.colProduct, row.is_auto ? styles.cellAuto : styles.cellMain]}>
                {row.is_auto ? `- ${row.name}` : row.name}
              </Text>
              <Text style={[styles.cellBody, styles.colQty]}>{row.qty}</Text>
              <Text style={[styles.cellBody, styles.colUom]}>{row.uom}</Text>
              <Text style={[styles.cellBody, styles.colAmount]}>
                {row.line_total > 0 ? formatKwacha(row.line_total) : ""}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatKwacha(grandTotal)}</Text>
        </View>

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
  headerBlock: { alignItems: "center", marginBottom: 12 },
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
  },
  cellHeader: { fontSize: 11, fontWeight: "700", color: "#57534e" },
  cellBody: { fontSize: 12, color: "#292524" },
  cellMain: { fontSize: 13, fontWeight: "600", color: "#292524" },
  cellAuto: { fontSize: 12, color: "#57534e" },
  colProduct: { flex: 2.2 },
  colQty: { flex: 0.7, textAlign: "center" },
  colUom: { flex: 0.9, paddingLeft: 8, textAlign: "center" },
  colAmount: { flex: 1, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: "700" },
  totalValue: { fontSize: 18, fontWeight: "700", color: "#c41e3a" },
  error: { color: "#b91c1c", marginTop: 12 },
});
