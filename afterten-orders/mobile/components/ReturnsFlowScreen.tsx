import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import type { OutletReturnRow } from "../lib/outlet-returns-list";
import { fetchOutletReturns } from "../lib/outlet-returns-list";
import {
  fetchOutletReturnCatalog,
  formatReturnQtyHint,
  type OutletReturnCatalogLine,
} from "../lib/outlet-return-catalog";
import { formatReturnPerOrderUnitHint, formatReturnUnitBreakdown } from "../lib/order-units";
import { ReturnSubmitScreen } from "./ReturnSubmitScreen";

type Props = {
  supabase: SupabaseClient;
  contentPaddingBottom: number;
  onBack: () => void;
  onSubmitReturn: (input: {
    returnId: string;
    catalogLineId: string;
    returnQty: number;
    photoUri: string;
    outletEmployeeId: string;
    employeePasscode: string;
    signaturePngUri: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  previewReturnNumber: string | null;
  saving: boolean;
  saveError: string | null;
};

type Phase = "list" | "pickProduct" | "enterQty" | "submit";

function statusLabel(status: OutletReturnRow["status"]): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Awaiting supervisor";
}

function returnLineSummary(item: OutletReturnRow): string | null {
  if (!item.lineName || item.returnQty == null) return null;
  const breakdown =
    item.lineUom && item.returnUnitsPerOrder != null && item.returnUnitsPerOrderUom
      ? formatReturnUnitBreakdown(
          item.returnQty,
          item.lineUom,
          item.returnUnitsPerOrder,
          item.returnUnitsPerOrderUom,
        )
      : null;
  if (breakdown) return `${item.lineName} — ${breakdown}`;
  const uom = item.lineUom?.trim();
  const base = uom ? `${item.returnQty} ${uom}` : String(item.returnQty);
  return `${item.lineName} — ${base}`;
}

export function ReturnsFlowScreen({
  supabase,
  contentPaddingBottom,
  onBack,
  onSubmitReturn,
  previewReturnNumber,
  saving,
  saveError,
}: Props) {
  const [returns, setReturns] = useState<OutletReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("list");
  const [catalog, setCatalog] = useState<OutletReturnCatalogLine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedLine, setSelectedLine] = useState<OutletReturnCatalogLine | null>(null);
  const [qtyText, setQtyText] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchOutletReturns(supabase);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setReturns([]);
      return;
    }
    setReturns(result.returns);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetNewReturn() {
    setPhase("list");
    setSelectedLine(null);
    setQtyText("");
    setPhotoUri(null);
    setLocalSaveError(null);
  }

  async function startNewReturn() {
    setLocalSaveError(null);
    setCatalogLoading(true);
    const result = await fetchOutletReturnCatalog(supabase);
    setCatalogLoading(false);
    if (!result.ok) {
      setLocalSaveError(result.error);
      return;
    }
    if (result.lines.length === 0) {
      setLocalSaveError("No products are available for returns at this outlet.");
      return;
    }
    setCatalog(result.lines);
    setPhase("pickProduct");
  }

  function onSelectLine(line: OutletReturnCatalogLine) {
    setSelectedLine(line);
    setQtyText("");
    setPhase("enterQty");
  }

  function qtyValid(): { ok: true; qty: number } | { ok: false; message: string } {
    if (!selectedLine) return { ok: false, message: "Select a product." };
    const raw = qtyText.trim();
    if (!raw) return { ok: false, message: "Enter return quantity." };
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, message: "Enter a quantity greater than zero." };
    }
    const step = selectedLine.qtyStep;
    if (step > 0 && Math.abs(qty / step - Math.round(qty / step)) > 0.000001) {
      return { ok: false, message: `Quantity must be in steps of ${step}.` };
    }
    return { ok: true, qty };
  }

  async function onContinueToCamera() {
    const check = qtyValid();
    if (!check.ok) {
      setLocalSaveError(check.message);
      return;
    }
    setLocalSaveError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setLocalSaveError("Camera permission is required to photograph the return.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
    setPhase("submit");
  }

  if (phase === "submit" && photoUri && selectedLine) {
    const qtyCheck = qtyValid();
    const returnQty = qtyCheck.ok ? qtyCheck.qty : 0;
    return (
      <ReturnSubmitScreen
        supabase={supabase}
        photoUri={photoUri}
        previewReturnNumber={previewReturnNumber}
        productSummary={formatReturnQtyHint(selectedLine, returnQty)}
        saving={saving}
        saveError={saveError ?? localSaveError}
        contentPaddingBottom={contentPaddingBottom}
        onBack={() => {
          setPhase("enterQty");
          setPhotoUri(null);
          setLocalSaveError(null);
        }}
        onSubmit={(employeeId, passcode, pad) => {
          void (async () => {
            if (!pad.isValid()) {
              setLocalSaveError(pad.validationMessage() ?? "Please sign in the box.");
              return;
            }
            const pngUri = await pad.capturePngUri();
            if (!pngUri) {
              setLocalSaveError("Could not read signature.");
              return;
            }
            const q = qtyValid();
            if (!q.ok) {
              setLocalSaveError(q.message);
              return;
            }
            setLocalSaveError(null);
            const result = await onSubmitReturn({
              returnId: Crypto.randomUUID(),
              catalogLineId: selectedLine.lineId,
              returnQty: q.qty,
              photoUri,
              outletEmployeeId: employeeId,
              employeePasscode: passcode,
              signaturePngUri: pngUri,
            });
            if (!result.ok) {
              setLocalSaveError(result.error ?? "Submit failed.");
              return;
            }
            resetNewReturn();
            void load();
          })();
        }}
      />
    );
  }

  if (phase === "enterQty" && selectedLine) {
    const previewQty = Number(qtyText.trim());
    const perHint = formatReturnPerOrderUnitHint(
      selectedLine.returnUnitsPerOrder,
      selectedLine.lineUom,
      selectedLine.returnUnitsPerOrderUom,
    );
    const hint =
      Number.isFinite(previewQty) && previewQty > 0
        ? formatReturnQtyHint(selectedLine, previewQty)
        : perHint ??
          `Enter qty in ${selectedLine.lineUom}. Total = qty × ${selectedLine.returnUnitsPerOrder} ${selectedLine.returnUnitsPerOrderUom}.`;

    return (
      <View style={styles.root}>
        <Pressable style={styles.backLink} onPress={() => setPhase("pickProduct")}>
          <Text style={styles.backLinkText}>← Product</Text>
        </Pressable>
        <Text style={styles.title}>Return quantity</Text>
        <Text style={styles.lead}>{selectedLine.name}</Text>
        <Text style={styles.metaHint}>{hint}</Text>

        <TextInput
          style={styles.qtyInput}
          value={qtyText}
          onChangeText={setQtyText}
          keyboardType="decimal-pad"
          placeholder={`Qty (${selectedLine.lineUom})`}
          placeholderTextColor="#a8a29e"
        />

        {localSaveError ? <Text style={styles.err}>{localSaveError}</Text> : null}

        <Pressable style={styles.newBtn} onPress={() => void onContinueToCamera()}>
          <Text style={styles.newBtnText}>Take photo & continue</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "pickProduct") {
    return (
      <View style={styles.root}>
        <Pressable style={styles.backLink} onPress={resetNewReturn}>
          <Text style={styles.backLinkText}>← Returns</Text>
        </Pressable>
        <Text style={styles.title}>Select product</Text>
        <Text style={styles.lead}>One product or variant per return.</Text>

        {catalogLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#c41e3a" />
        ) : (
          <FlatList
            data={catalog}
            keyExtractor={(item) => item.lineId}
            contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
            renderItem={({ item }) => (
              <Pressable style={styles.catalogCard} onPress={() => onSelectLine(item)}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.catalogThumb} />
                ) : (
                  <View style={styles.catalogThumbPlaceholder} />
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.catalogName}>{item.name}</Text>
                  <Text style={styles.catalogMeta}>
                    {formatReturnPerOrderUnitHint(
                      item.returnUnitsPerOrder,
                      item.lineUom,
                      item.returnUnitsPerOrderUom,
                    ) ??
                      `${item.returnUnitsPerOrder} ${item.returnUnitsPerOrderUom} per ${item.lineUom}`}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Dashboard</Text>
      </Pressable>
      <Text style={styles.title}>Returns</Text>

      <Pressable
        style={styles.newBtn}
        onPress={() => void startNewReturn()}
        disabled={catalogLoading}
      >
        <Text style={styles.newBtnText}>
          {catalogLoading ? "Loading products…" : "New return"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.err}>{error}</Text> : null}
      {localSaveError ? <Text style={styles.err}>{localSaveError}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#c41e3a" />
      ) : (
        <FlatList
          data={returns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={<Text style={styles.empty}>No returns yet.</Text>}
          renderItem={({ item }) => {
            const summary = returnLineSummary(item);
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Return #{item.returnNumber}</Text>
                {summary ? <Text style={styles.cardMeta}>{summary}</Text> : null}
                <Text style={styles.cardMeta}>{item.employeeName}</Text>
                <Text style={styles.cardStatus}>{statusLabel(item.status)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backLink: { marginBottom: 8 },
  backLinkText: { color: "#c41e3a", fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", color: "#292524", textAlign: "center" },
  lead: { fontSize: 13, color: "#57534e", textAlign: "center", marginTop: 4, marginBottom: 12 },
  metaHint: { fontSize: 13, color: "#1e3a8a", textAlign: "center", marginBottom: 16 },
  newBtn: {
    marginTop: 16,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: "center",
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  qtyInput: {
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    marginTop: 8,
    backgroundColor: "#fff",
  },
  err: { marginTop: 10, color: "#b91c1c", textAlign: "center", fontSize: 13 },
  empty: { marginTop: 24, textAlign: "center", color: "#78716c" },
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1e3a8a" },
  cardMeta: { marginTop: 4, fontSize: 13, color: "#57534e" },
  cardStatus: { marginTop: 8, fontSize: 13, fontWeight: "600", color: "#c41e3a" },
  catalogCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    backgroundColor: "#fff",
  },
  catalogName: { fontSize: 15, fontWeight: "700", color: "#292524" },
  catalogMeta: { marginTop: 4, fontSize: 12, color: "#57534e" },
  catalogThumb: { width: 52, height: 52, borderRadius: 8 },
  catalogThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#f5f5f4",
  },
});
