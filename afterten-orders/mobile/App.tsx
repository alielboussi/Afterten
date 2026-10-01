import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  createSupabaseClient,
  fetchOutletProducts,
  fetchOutletProfile,
  supabaseConfigured,
  clampOrderQty,
  getOutletDisplayName,
  type OutletProduct,
  type OutletProductVariant,
  type OutletProfile,
  type OrderQtyLine,
} from "./lib/supabase";
import { ZoomableImage } from "./components/ZoomableImage";

type Screen = "loading" | "login" | "home";

export default function App() {
  const supabase = useMemo(() => (supabaseConfigured() ? createSupabaseClient() : null), []);
  const [screen, setScreen] = useState<Screen>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OutletProfile | null>(null);
  const [products, setProducts] = useState<OutletProduct[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [orderFlowActive, setOrderFlowActive] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [variantsModalProduct, setVariantsModalProduct] = useState<OutletProduct | null>(null);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

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
    setOrderFlowActive(false);
    setProducts([]);
    setScreen("home");
  }, [supabase]);

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
    setOrderFlowActive(false);
    setProducts([]);
    setBusy(false);
    setScreen("home");
  }

  async function onStartOrder() {
    if (!supabase) return;
    setOrderFlowActive(true);
    setProductsError(null);
    if (products.length > 0) return;
    setProductsLoading(true);
    await loadProducts();
    setProductsLoading(false);
  }

  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setProducts([]);
    setOrderFlowActive(false);
    setLightboxUrl(null);
    setVariantsModalProduct(null);
    setCartQty({});
    setQtyDraft({});
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
    const displayName = getOutletDisplayName(profile);
    const gridGap = 10;
    const gridPadding = 16;
    const gridItemWidth =
      (Dimensions.get("window").width - gridPadding * 2 - gridGap) / 2;

    const statusPad = (Constants.statusBarHeight ?? 0) + 8;

    function commitQtyLine(lineId: string, line: OrderQtyLine, raw: string) {
      setQtyDraft((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      if (!raw.trim()) {
        setCartQty((prev) => ({ ...prev, [lineId]: 0 }));
        return;
      }
      const parsed = Number.parseFloat(raw.replace(",", "."));
      if (Number.isNaN(parsed) || parsed <= 0) {
        setCartQty((prev) => ({ ...prev, [lineId]: 0 }));
        return;
      }
      setCartQty((prev) => ({ ...prev, [lineId]: clampOrderQty(line, parsed) }));
    }

    function renderQtyControls(
      lineId: string,
      line: OrderQtyLine & { orderable: boolean; live_qty_gate_enabled?: boolean },
      showUnavailable: boolean,
    ) {
      if (showUnavailable) {
        return <Text style={styles.qtyMeta}>Not available</Text>;
      }
      const step = line.qty_step > 0 ? line.qty_step : 1;
      const qty = cartQty[lineId] ?? 0;
      const qtyText =
        qtyDraft[lineId] ?? (qty === 0 ? "" : String(Number.isInteger(qty) ? qty : qty));
      const canDec = line.orderable && qty > 0;
      const canInc = line.orderable;

      return (
        <View style={styles.cardStepper}>
          <Pressable
            style={[styles.cardStepBtn, !canDec && styles.cardStepBtnDisabled]}
            disabled={!canDec}
            onPress={() =>
              setCartQty((prev) => ({
                ...prev,
                [lineId]: clampOrderQty(line, qty - step),
              }))
            }
          >
            <Text style={styles.cardStepBtnText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.cardQtyInput}
            value={qtyText}
            editable={line.orderable}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor="#a8a29e"
            onChangeText={(text) => setQtyDraft((prev) => ({ ...prev, [lineId]: text }))}
            onBlur={() => commitQtyLine(lineId, line, qtyDraft[lineId] ?? qtyText)}
          />
          <Pressable
            style={[styles.cardStepBtn, !canInc && styles.cardStepBtnDisabled]}
            disabled={!canInc}
            onPress={() =>
              setCartQty((prev) => ({
                ...prev,
                [lineId]: clampOrderQty(line, qty + step),
              }))
            }
          >
            <Text style={styles.cardStepBtnText}>+</Text>
          </Pressable>
        </View>
      );
    }

    function renderCatalogCard(item: OutletProduct | OutletProductVariant, isVariant: boolean) {
      const lineId = isVariant
        ? (item as OutletProductVariant).variant_id
        : (item as OutletProduct).product_id;
      const name = item.name;
      const imageUrl = item.image_url;
      const showUnavailable = item.live_qty_gate_enabled && !item.orderable;

      return (
        <View
          style={[
            styles.gridItem,
            { width: gridItemWidth },
            !item.orderable && styles.productRowOff,
          ]}
        >
          <Pressable
            onPress={() => imageUrl && setLightboxUrl(imageUrl)}
            disabled={!imageUrl}
            accessibilityRole="button"
            accessibilityLabel={`View larger image for ${name}`}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.gridImage} />
            ) : (
              <View style={styles.gridImagePlaceholder}>
                <Text style={styles.placeholderText}>—</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.gridItemBody}>
            <View style={styles.productNameSlot}>
              <Text style={styles.productName} numberOfLines={2}>
                {name}
              </Text>
            </View>
            <Text style={styles.productMeta}>
              {item.uom} · K{item.unit_cost.toFixed(2)}
            </Text>
            <View style={styles.cardControlsSlot}>
              {renderQtyControls(lineId, item, showUnavailable)}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.home, { paddingTop: statusPad }]}>
        {!orderFlowActive ? (
          <>
            <View style={styles.dashboardTopBar}>
              <Pressable
                style={styles.signOutBtn}
                onPress={() => void onSignOut()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
            <View style={styles.dashboard}>
              <View style={styles.dashboardUpper}>
                <View style={styles.welcomeBlock}>
                  <Text style={styles.welcomeLabel}>Welcome,</Text>
                  <Text style={styles.welcomeName} numberOfLines={3} ellipsizeMode="tail">
                    {displayName}
                  </Text>
                </View>
                <Pressable
                  style={[styles.placeOrderBtn, busy && styles.primaryBtnDisabled]}
                  disabled={busy}
                  onPress={() => void onStartOrder()}
                >
                  <Text style={styles.placeOrderBtnText}>Place an Order</Text>
                </Pressable>
              </View>
              <View style={styles.dashboardActionsSlot} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.orderHeader}>
              <View style={styles.orderHeaderWelcome}>
                <Text style={styles.welcomeLabelCompactCenter}>Welcome,</Text>
                <Text style={styles.welcomeTopNameCenter} numberOfLines={2} ellipsizeMode="tail">
                  {displayName}
                </Text>
              </View>
              <Pressable
                style={styles.orderHeaderSignOut}
                onPress={() => void onSignOut()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
            <View style={styles.orderPane}>
            <Pressable
              style={styles.backLink}
              onPress={() => {
                setOrderFlowActive(false);
                setLightboxUrl(null);
                setQtyDraft({});
              }}
            >
              <Text style={styles.backLinkText}>← Dashboard</Text>
            </Pressable>
            {productsError ? <Text style={styles.error}>{productsError}</Text> : null}
            {productsLoading ? (
              <View style={styles.productsLoading}>
                <ActivityIndicator size="large" color="#c41e3a" />
              </View>
            ) : (
              <FlatList
                style={styles.productList}
                data={products}
                keyExtractor={(item) => item.product_id}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.sub}>
                    No products yet. Add them in the portal Products page.
                  </Text>
                }
                renderItem={({ item }) => {
                  const hasVariantPicker = item.has_variants && item.variants.length > 0;
                  const showUnavailable =
                    !hasVariantPicker && item.live_qty_gate_enabled && !item.orderable;

                  return (
                    <View
                      style={[
                        styles.gridItem,
                        { width: gridItemWidth },
                        !item.orderable && !hasVariantPicker && styles.productRowOff,
                      ]}
                    >
                      <Pressable
                        onPress={() => item.image_url && setLightboxUrl(item.image_url)}
                        disabled={!item.image_url}
                        accessibilityRole="button"
                        accessibilityLabel={`View larger image for ${item.name}`}
                      >
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.gridImage} />
                        ) : (
                          <View style={styles.gridImagePlaceholder}>
                            <Text style={styles.placeholderText}>—</Text>
                          </View>
                        )}
                      </Pressable>
                      <View style={styles.gridItemBody}>
                        <View style={styles.productNameSlot}>
                          <Text style={styles.productName} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </View>
                        <Text style={styles.productMeta}>
                          {item.uom} · K{item.unit_cost.toFixed(2)}
                        </Text>
                        <View style={styles.cardControlsSlot}>
                          {hasVariantPicker ? (
                            <Pressable
                              style={styles.variantsBtn}
                              onPress={() => setVariantsModalProduct(item)}
                            >
                              <Text style={styles.variantsBtnText}>Variants</Text>
                            </Pressable>
                          ) : (
                            renderQtyControls(item.product_id, item, showUnavailable)
                          )}
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
          </>
        )}

        <Modal
          visible={variantsModalProduct != null}
          animationType="slide"
          onRequestClose={() => setVariantsModalProduct(null)}
        >
          <View style={styles.variantsModal}>
            <View style={styles.variantsModalHeader}>
              <Text style={styles.variantsModalTitle} numberOfLines={2}>
                {variantsModalProduct?.name ?? "Variants"}
              </Text>
              <Pressable
                onPress={() => setVariantsModalProduct(null)}
                accessibilityRole="button"
                accessibilityLabel="Close variants"
              >
                <Ionicons name="close" size={26} color="#292524" />
              </Pressable>
            </View>
            <FlatList
              data={variantsModalProduct?.variants ?? []}
              keyExtractor={(v) => v.variant_id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: variant }) => renderCatalogCard(variant, true)}
            />
          </View>
        </Modal>

        <Modal
          visible={lightboxUrl != null}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxUrl(null)}
        >
          <View style={styles.lightboxBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLightboxUrl(null)} />
            {lightboxUrl ? <ZoomableImage uri={lightboxUrl} /> : null}
            <Pressable
              style={styles.lightboxClose}
              onPress={() => setLightboxUrl(null)}
              accessibilityRole="button"
              accessibilityLabel="Close image"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </Modal>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.loginHeader}>
        <Image
          source={require("./assets/afterten-logo.png")}
          style={styles.loginLogo}
          resizeMode="contain"
          accessibilityLabel="Afterten"
        />
        <Text style={styles.title}>Afterten Orders</Text>
      </View>

      {error ? (
        <Text style={[styles.error, styles.loginError]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email e.g. rive@ordersapp.com"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.fieldLabel}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          secureTextEntry={!showPassword}
          placeholder="6-digit password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={styles.passwordToggle}
          onPress={() => setShowPassword((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
        >
          <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#78716c" />
        </Pressable>
      </View>
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
    alignItems: "center",
  },
  loginHeader: {
    alignItems: "center",
    marginBottom: 28,
    width: "100%",
    maxWidth: 360,
  },
  loginLogo: {
    width: 160,
    height: 160,
    marginBottom: 12,
  },
  home: { flex: 1, backgroundColor: "#fffbf7", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    minHeight: 44,
  },
  orderHeader: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginBottom: 8,
    paddingHorizontal: 64,
  },
  orderHeaderWelcome: {
    alignItems: "center",
    width: "100%",
  },
  orderHeaderSignOut: {
    position: "absolute",
    right: 0,
    top: 0,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  welcomeBlock: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  welcomeBlockTop: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  welcomeLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#57534e",
    textAlign: "center",
    marginBottom: 6,
  },
  welcomeName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "center",
    lineHeight: 30,
    width: "100%",
  },
  welcomeLabelCompact: {
    fontSize: 14,
    fontWeight: "600",
    color: "#57534e",
    marginBottom: 2,
  },
  welcomeLabelCompactCenter: {
    fontSize: 14,
    fontWeight: "600",
    color: "#57534e",
    marginBottom: 2,
    textAlign: "center",
  },
  welcomeTopName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e3a8a",
    lineHeight: 24,
  },
  welcomeTopNameCenter: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e3a8a",
    lineHeight: 24,
    textAlign: "center",
  },
  dashboardTopBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: 36,
    marginBottom: 8,
  },
  dashboard: {
    flex: 1,
    minHeight: 0,
  },
  dashboardUpper: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 56,
  },
  dashboardActionsSlot: {
    flex: 1,
    minHeight: 48,
  },
  orderPane: { flex: 1, minHeight: 0 },
  productList: { flex: 1 },
  placeOrderBtn: {
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minWidth: 240,
    alignItems: "center",
  },
  placeOrderBtnText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  backLink: { marginBottom: 6, paddingVertical: 2, alignSelf: "flex-start" },
  backLinkText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  productsLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 0,
    color: "#292524",
    textAlign: "center",
  },
  sub: { fontSize: 15, color: "#57534e", marginBottom: 20, lineHeight: 22, textAlign: "center" },
  listContent: { paddingBottom: 32, paddingHorizontal: 0 },
  gridRow: { justifyContent: "space-between", marginBottom: 10 },
  gridItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    flexDirection: "column",
  },
  productRowOff: { opacity: 0.55 },
  gridImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  gridImagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f5f5f4",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#a8a29e" },
  gridItemBody: {
    flex: 1,
    minHeight: 108,
    justifyContent: "flex-start",
  },
  productNameSlot: {
    height: 40,
    justifyContent: "flex-start",
  },
  productName: { fontSize: 14, fontWeight: "600", color: "#292524", lineHeight: 18 },
  productMeta: {
    fontSize: 12,
    color: "#78716c",
    height: 16,
    lineHeight: 16,
    marginBottom: 8,
  },
  qtyMeta: { fontSize: 11, color: "#9a3412", height: 32, lineHeight: 32 },
  cardControlsSlot: {
    height: 32,
    justifyContent: "center",
  },
  variantsBtn: {
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: "center",
  },
  variantsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  variantsModal: {
    flex: 1,
    backgroundColor: "#fffbf7",
    paddingTop: (Constants.statusBarHeight ?? 0) + 12,
    paddingHorizontal: 16,
  },
  variantsModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  variantsModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "center",
  },
  cardStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 32,
    gap: 4,
  },
  cardStepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#c41e3a",
    alignItems: "center",
    justifyContent: "center",
  },
  cardStepBtnDisabled: { opacity: 0.35 },
  cardStepBtnText: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 20 },
  cardQtyInput: {
    flex: 1,
    minWidth: 0,
    height: 32,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 8,
    backgroundColor: "#fffbf7",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#292524",
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxClose: {
    position: "absolute",
    top: 56,
    right: 24,
    padding: 8,
  },
  input: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  fieldLabel: {
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: 360,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#292524",
  },
  passwordRow: {
    width: "100%",
    maxWidth: 360,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtn: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  signOutBtn: {
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  signOutText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  error: { color: "#b91c1c", marginBottom: 12, lineHeight: 20, paddingHorizontal: 8 },
  loginError: { textAlign: "center", width: "100%", maxWidth: 360 },
});
