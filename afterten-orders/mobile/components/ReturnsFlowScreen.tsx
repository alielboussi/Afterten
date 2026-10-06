import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import type { OutletReturnRow } from "../lib/outlet-returns-list";
import { fetchOutletReturns } from "../lib/outlet-returns-list";
import { ReturnSubmitScreen } from "./ReturnSubmitScreen";

type Props = {
  supabase: SupabaseClient;
  contentPaddingBottom: number;
  onBack: () => void;
  onSubmitReturn: (input: {
    returnId: string;
    photoUri: string;
    outletEmployeeId: string;
    employeePasscode: string;
    signaturePngUri: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  previewReturnNumber: string | null;
  saving: boolean;
  saveError: string | null;
};

function statusLabel(status: OutletReturnRow["status"]): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Awaiting supervisor";
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
  const [phase, setPhase] = useState<"list" | "submit">("list");
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

  async function onTakePhotoAndContinue() {
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

  if (phase === "submit" && photoUri) {
    return (
      <ReturnSubmitScreen
        supabase={supabase}
        photoUri={photoUri}
        previewReturnNumber={previewReturnNumber}
        saving={saving}
        saveError={saveError ?? localSaveError}
        contentPaddingBottom={contentPaddingBottom}
        onBack={() => {
          setPhase("list");
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
            setLocalSaveError(null);
            const result = await onSubmitReturn({
              returnId: Crypto.randomUUID(),
              photoUri,
              outletEmployeeId: employeeId,
              employeePasscode: passcode,
              signaturePngUri: pngUri,
            });
            if (!result.ok) {
              setLocalSaveError(result.error ?? "Submit failed.");
              return;
            }
            setPhase("list");
            setPhotoUri(null);
            void load();
          })();
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Dashboard</Text>
      </Pressable>
      <Text style={styles.title}>Returns</Text>

      <Pressable style={styles.newBtn} onPress={() => void onTakePhotoAndContinue()}>
        <Text style={styles.newBtnText}>New return (camera)</Text>
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
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Return #{item.returnNumber}</Text>
              <Text style={styles.cardMeta}>{item.employeeName}</Text>
              <Text style={styles.cardStatus}>{statusLabel(item.status)}</Text>
            </View>
          )}
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
  newBtn: {
    marginTop: 16,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: "center",
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
});
