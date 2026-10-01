import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  createSupabaseClient,
  fetchOutletProducts,
  fetchOutletProfile,
  supabaseConfigured,
  clampOrderQty,
  type OutletProduct,
  type OutletProfile,
} from "./lib/supabase";

type Screen = "loading" | "login" | "home";

export default function App() {
  const supabase = useMemo(() => (supabaseConfigured() ? createSupabaseClient() : null), []);
  const [screen, setScreen] = useState<Screen>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OutletProfile | null>(null);
  const [products, setProducts] = useState<OutletProduct[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { products: rows, error: err } = await fetchOutletProducts(supabase);
    setProducts(rows);
    setProductsError(err);
  }, [supabase]);

  const bootstrap = useCallback(async () => {
    if (!supabase) {
      setScreen("login");
      setError("Add mobile/.env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setScreen("login");
      return;
    }
    const { profile: p, error: profileError } = await fetchOutletProfile(supabase);
    if (profileError || !p) {
      setError(profileError);
      setScreen("login");
      return;
    }
    setProfile(p);
    await loadProducts();
    setScreen("home");
  }, [supabase, loadProducts]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function onSignIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (signInError) {
      setBusy(false);
      setError(signInError.message);
      return;
    }
    const { profile: p, error: profileError } = await fetchOutletProfile(supabase);
    if (profileError || !p) {
      setBusy(false);
      setError(profileError ?? "Could not load outlet profile.");
      return;
    }
    setProfile(p);
    await loadProducts();
    setBusy(false);
    setScreen("home");
  }

  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setProducts([]);
    setCartQty({});
    setPassword("");
    setScreen("login");
  }

  if (screen === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#c41e3a" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "home" && profile) {
    const displayName = profile.alias?.trim() || profile.outlet_name;
    return (
      <View style={styles.home}>
        <View style={styles.homeHeader}>
          <Text style={styles.title}>Afterten Orders</Text>
          <Text style={styles.welcome}>Welcome, {displayName}</Text>
          <Pressable style={styles.signOutBtn} onPress={() => void onSignOut()}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Products</Text>
        {productsError ? <Text style={styles.error}>{productsError}</Text> : null}

        <FlatList
          data={products}
          keyExtractor={(item) => item.product_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.sub}>No products yet. Add them in the portal Products page.</Text>
          }
          renderItem={({ item }) => {
            const qty = cartQty[item.product_id] ?? 0;
            const step = item.qty_step > 0 ? item.qty_step : 1;
            const canDec = item.orderable && qty > 0;
            const canInc = item.orderable;

            return (
              <View style={[styles.productRow, !item.orderable && styles.productRowOff]}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.productImage} />
                ) : (
                  <View style={styles.productImagePlaceholder}>
                    <Text style={styles.placeholderText}>—</Text>
                  </View>
                )}
                <View style={styles.productBody}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productMeta}>
                    {item.uom} · K{item.unit_cost.toFixed(2)} · step {step}
                  </Text>
                  {item.live_qty_gate_enabled ? (
                    <Text style={styles.qtyMeta}>
                      Live qty: {item.live_qty ?? 0}
                      {!item.orderable ? " · Not orderable" : ""}
                    </Text>
                  ) : null}
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={[styles.stepperBtn, !canDec && styles.stepperBtnDisabled]}
                      disabled={!canDec}
                      onPress={() =>
                        setCartQty((prev) => ({
                          ...prev,
                          [item.product_id]: clampOrderQty(item, qty - step),
                        }))
                      }
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperQty}>
                      {qty} {item.uom}
                    </Text>
                    <Pressable
                      style={[styles.stepperBtn, !canInc && styles.stepperBtnDisabled]}
                      disabled={!canInc}
                      onPress={() =>
                        setCartQty((prev) => ({
                          ...prev,
                          [item.product_id]: clampOrderQty(item, qty + step),
                        }))
                      }
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Afterten Orders</Text>
      <Text style={styles.sub}>Outlet sign-in (email + password from the portal)</Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email e.g. rive@ordersapp.com"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="6-digit password"
        value={password}
        onChangeText={setPassword}
      />
      <Pressable
        style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
        disabled={busy}
        onPress={() => void onSignIn()}
      >
        <Text style={styles.primaryBtnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <StatusBar style="auto" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fffbf7" },
  container: {
    flex: 1,
    backgroundColor: "#fffbf7",
    padding: 24,
    justifyContent: "center",
  },
  home: { flex: 1, backgroundColor: "#fffbf7", paddingTop: 48, paddingHorizontal: 16 },
  homeHeader: { marginBottom: 16, paddingHorizontal: 8 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4, color: "#292524" },
  welcome: { fontSize: 17, fontWeight: "600", color: "#1e3a8a" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#292524",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  sub: { fontSize: 15, color: "#57534e", marginBottom: 20, lineHeight: 22, textAlign: "center" },
  listContent: { paddingBottom: 32, gap: 10 },
  productRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
  },
  productRowOff: { opacity: 0.55 },
  productImage: { width: 56, height: 56, borderRadius: 8 },
  productImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#f5f5f4",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#a8a29e" },
  productBody: { flex: 1, justifyContent: "center" },
  productName: { fontSize: 16, fontWeight: "600", color: "#292524" },
  productMeta: { fontSize: 13, color: "#78716c", marginTop: 4 },
  qtyMeta: { fontSize: 12, color: "#9a3412", marginTop: 4 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#c41e3a",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperBtnText: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  stepperQty: { minWidth: 72, textAlign: "center", fontWeight: "600", color: "#292524" },
  input: {
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  primaryBtn: {
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  signOutBtn: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  signOutText: { color: "#c41e3a", fontWeight: "600" },
  error: { color: "#b91c1c", marginBottom: 12, lineHeight: 20, paddingHorizontal: 8 },
});
