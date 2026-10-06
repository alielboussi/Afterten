import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSupervisorReturns, type SupervisorReturnRow } from "../lib/supervisor-returns";

type Props = {
  supabase: SupabaseClient;
  onBack: () => void;
  contentPaddingBottom: number;
  onOpenReturn: (returnId: string) => void;
  refreshToken?: number;
};

function statusLabel(status: SupervisorReturnRow["status"]): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Submitted";
}

export function SupervisorReturnsScreen({
  supabase,
  onBack,
  contentPaddingBottom,
  onOpenReturn,
  refreshToken = 0,
}: Props) {
  const [query, setQuery] = useState("");
  const [returns, setReturns] = useState<SupervisorReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchSupervisorReturns(supabase, query);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setReturns([]);
      return;
    }
    setReturns(result.returns);
  }, [supabase, query]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Returns</Text>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search returns…"
        placeholderTextColor="#a8a29e"
      />
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color="#c41e3a" />
      ) : (
        <FlatList
          data={returns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
          ListEmptyComponent={<Text style={styles.empty}>No returns.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => onOpenReturn(item.id)}>
              <Text style={styles.cardTitle}>#{item.returnNumber}</Text>
              <Text style={styles.cardMeta}>{item.outletName}</Text>
              <Text style={styles.cardMeta}>{item.employeeName}</Text>
              <Text style={styles.cardStatus}>{statusLabel(item.status)}</Text>
            </Pressable>
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
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", color: "#292524" },
  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  err: { marginTop: 10, color: "#b91c1c", textAlign: "center" },
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
  cardStatus: { marginTop: 8, fontWeight: "600", color: "#c41e3a" },
});
