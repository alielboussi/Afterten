import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import { formatOrderUnitBreakdown, formatPerOrderUnitHint } from "./lib/order-units";
import {
  formatOrderWindowUsage,
  isOrderWindowExhausted,
} from "./lib/order-qty-limits";
import { applyParentCatalogToVariant } from "./lib/catalog-lines";
import { prefetchCatalogImages } from "./lib/catalog-image-cache";
import { useAppScreenLayout } from "./lib/screen-layout";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ZoomableImage } from "./components/ZoomableImage";
import { CatalogProductImage } from "./components/CatalogProductImage";
import { OrderSummaryScreen } from "./components/OrderSummaryScreen";
import { OutletAcceptedOrderDetailScreen } from "./components/OutletAcceptedOrderDetailScreen";
import { ViewOrdersScreen } from "./components/ViewOrdersScreen";
import { OffloadingDashboardScreen } from "./components/OffloadingDashboardScreen";
import { OffloadingChecklistScreen } from "./components/OffloadingChecklistScreen";
import { OffloadingSignScreen } from "./components/OffloadingSignScreen";
import { CompletedOrdersScreen } from "./components/CompletedOrdersScreen";
import { CompletedOrderDetailScreen } from "./components/CompletedOrderDetailScreen";
import { ToastBanner } from "./components/ToastBanner";
import {
  cartHasItems,
  fetchOrderSummaryPreview,
  type OrderSummaryPreview,
} from "./lib/order-summary";
import { submitOutletOrder } from "./lib/submit-outlet-order";
import { flushOfflineCompleteQueue } from "./lib/offline-complete-queue";
import { registerOutletPushNotifications } from "./lib/outlet-push";
import type { SignaturePadHandle } from "./components/SignaturePad";

type Screen = "loading" | "login" | "home";

function AppShell() {
  const supabase = useMemo(() => (supabaseConfigured() ? createSupabaseClient() : null), []);
  const screenLayout = useAppScreenLayout();
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
  const [orderSummaryActive, setOrderSummaryActive] = useState(false);
  const [orderSummaryPreview, setOrderSummaryPreview] = useState<OrderSummaryPreview | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [orderSaveError, setOrderSaveError] = useState<string | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [viewOrdersActive, setViewOrdersActive] = useState(false);
  const [viewOrderDetailId, setViewOrderDetailId] = useState<string | null>(null);
  const [offloadingActive, setOffloadingActive] = useState(false);
  const [offloadingChecklistOrderId, setOffloadingChecklistOrderId] = useState<string | null>(null);
  const [offloadingSignOrderId, setOffloadingSignOrderId] = useState<string | null>(null);
  const [offloadingRefreshToken, setOffloadingRefreshToken] = useState(0);
  const [completedOrdersActive, setCompletedOrdersActive] = useState(false);
  const [completedOrderDetailId, setCompletedOrderDetailId] = useState<string | null>(null);

  async function onViewSummary() {
    if (!supabase || !cartHasItems(cartQty)) return;
    setSummaryLoading(true);
    setProductsError(null);
    const { preview, error } = await fetchOrderSummaryPreview(supabase, products, cartQty);
    setSummaryLoading(false);
    if (error || !preview) {
      setProductsError(error ?? "Could not build order summary.");
      return;
    }
    setOrderSaveError(null);
    setOrderSummaryPreview(preview);
    setOrderSummaryActive(true);
  }

  async function onSaveOrderFromSummary(employeeName: string, signaturePad: SignaturePadHandle) {
    if (!supabase || !profile || orderSaving) return;
    if (!signaturePad.isValid()) {
      setOrderSaveError(signaturePad.validationMessage() ?? "Please sign in the box.");
      return;
    }
    setOrderSaving(true);
    setOrderSaveError(null);
    const pngUri = await signaturePad.capturePngUri();
    if (!pngUri) {
      setOrderSaving(false);
      setOrderSaveError("Could not read signature. Try again.");
      return;
    }
    const result = await submitOutletOrder(supabase, {
      outletId: profile.outlet_id,
      employeeName,
      signaturePngUri: pngUri,
      products,
      cartQty,
    });
    setOrderSaving(false);
    if (!result.ok) {
      setOrderSaveError(result.error);
      return;
    }
    setCartQty({});
    setQtyDraft({});
    setOrderSummaryActive(false);
    setOrderSummaryPreview(null);
    setOrderFlowActive(false);
    setOrderSaveError(null);
    setSaveToast(`Order ${result.orderNumber} saved.`);
    void loadProducts();
  }

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { products: rows, error: err } = await fetchOutletProducts(supabase);
    setProducts(rows);
    setProductsError(err);
    if (!err && rows.length > 0) {
      const urls: string[] = [];
      for (const p of rows) {
        if (p.image_url) urls.push(p.image_url);
        for (const v of p.variants) {
          if (v.image_url) urls.push(v.image_url);
        }
      }
      prefetchCatalogImages(urls);
    }
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
    void registerOutletPushNotifications(supabase);
    void flushOfflineCompleteQueue(supabase).then((r) => {
      if (r.processed > 0) {
        setSaveToast(`${r.processed} queued order(s) completed.`);
      }
    });
  }, [supabase]);

  useEffect(() => {
    if (!supabase || screen !== "home") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void flushOfflineCompleteQueue(supabase).then((r) => {
        if (r.processed > 0) {
          setSaveToast(`${r.processed} queued order(s) completed.`);
          setOffloadingRefreshToken((t) => t + 1);
        }
      });
    });
    return () => sub.remove();
  }, [supabase, screen]);

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
    setOrderSummaryActive(false);
    setOrderSummaryPreview(null);
    setLightboxUrl(null);
    setVariantsModalProduct(null);
    setCartQty({});
    setQtyDraft({});
    setPassword("");
    setScreen("login");
  }

  if (screen === "loading") {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: screenLayout.paddingTop, paddingBottom: screenLayout.paddingBottom },
        ]}
      >
        <ActivityIndicator size="large" color="#c41e3a" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "home" && profile && supabase) {
    if (viewOrderDetailId) {
      return (
        <View
          style={[
            styles.home,
            {
              paddingTop: screenLayout.paddingTop,
              paddingBottom: screenLayout.paddingBottom,
              paddingHorizontal: screenLayout.paddingHorizontal,
            },
          ]}
        >
          <OutletAcceptedOrderDetailScreen
            supabase={supabase}
            orderId={viewOrderDetailId}
            onBack={() => setViewOrderDetailId(null)}
            contentPaddingBottom={screenLayout.paddingBottom + 16}
          />
          <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
          <StatusBar style="auto" />
        </View>
      );
    }

    if (completedOrdersActive && supabase) {
      if (completedOrderDetailId) {
        return (
          <View
            style={[
              styles.home,
              {
                paddingTop: screenLayout.paddingTop,
                paddingBottom: screenLayout.paddingBottom,
                paddingHorizontal: screenLayout.paddingHorizontal,
              },
            ]}
          >
            <CompletedOrderDetailScreen
              supabase={supabase}
              orderId={completedOrderDetailId}
              onBack={() => setCompletedOrderDetailId(null)}
              onToast={setSaveToast}
              contentPaddingBottom={screenLayout.paddingBottom + 16}
            />
            <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
            <StatusBar style="auto" />
          </View>
        );
      }
      return (
        <View
          style={[
            styles.home,
            {
              paddingTop: screenLayout.paddingTop,
              paddingBottom: screenLayout.paddingBottom,
              paddingHorizontal: screenLayout.paddingHorizontal,
            },
          ]}
        >
          <CompletedOrdersScreen
            supabase={supabase}
            onBack={() => setCompletedOrdersActive(false)}
            onOpenDetail={(id) => setCompletedOrderDetailId(id)}
            onToast={setSaveToast}
            contentPaddingBottom={screenLayout.paddingBottom + 16}
          />
          <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
          <StatusBar style="auto" />
        </View>
      );
    }

    if (offloadingActive && supabase) {
      const offloadingShell = (
        <View
          style={[
            styles.home,
            {
              paddingTop: screenLayout.paddingTop,
              paddingBottom: screenLayout.paddingBottom,
              paddingHorizontal: screenLayout.paddingHorizontal,
            },
          ]}
        >
          {offloadingSignOrderId ? (
            <OffloadingSignScreen
              supabase={supabase}
              orderId={offloadingSignOrderId}
              onBack={() => setOffloadingSignOrderId(null)}
              onComplete={(message) => {
                setOffloadingSignOrderId(null);
                setOffloadingRefreshToken((t) => t + 1);
                setSaveToast(message);
              }}
              contentPaddingBottom={screenLayout.paddingBottom + 16}
            />
          ) : offloadingChecklistOrderId ? (
            <OffloadingChecklistScreen
              supabase={supabase}
              orderId={offloadingChecklistOrderId}
              onBack={() => setOffloadingChecklistOrderId(null)}
              onAccepted={() => {
                setOffloadingChecklistOrderId(null);
                setOffloadingRefreshToken((t) => t + 1);
                setSaveToast("Items accepted. Tap the sign icon to complete the order.");
              }}
              onToast={setSaveToast}
              contentPaddingBottom={screenLayout.paddingBottom + 16}
            />
          ) : (
            <OffloadingDashboardScreen
              supabase={supabase}
              onBack={() => setOffloadingActive(false)}
              onOpenChecklist={(id) => setOffloadingChecklistOrderId(id)}
              onOpenSign={(id) => setOffloadingSignOrderId(id)}
              onSignBlocked={() =>
                setSaveToast("Confirm all received items before signing off.")
              }
              refreshToken={offloadingRefreshToken}
              contentPaddingBottom={screenLayout.paddingBottom + 16}
            />
          )}
          <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
          <StatusBar style="auto" />
        </View>
      );
      return offloadingShell;
    }

    if (viewOrdersActive) {
      return (
        <View
          style={[
            styles.home,
            {
              paddingTop: screenLayout.paddingTop,
              paddingBottom: screenLayout.paddingBottom,
              paddingHorizontal: screenLayout.paddingHorizontal,
            },
          ]}
        >
          <ViewOrdersScreen
            supabase={supabase}
            onBack={() => setViewOrdersActive(false)}
            onOpenOrder={(id) => setViewOrderDetailId(id)}
            contentPaddingBottom={screenLayout.paddingBottom + 16}
          />
          <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
          <StatusBar style="auto" />
        </View>
      );
    }
    const displayName = getOutletDisplayName(profile);
    const { gridItemWidth, gridGap, catalogImageHeight, compact } = screenLayout;

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
      if (!line.orderable && isOrderWindowExhausted(line)) {
        const usage = formatOrderWindowUsage(line);
        return (
          <Text style={styles.qtyMeta}>
            {usage ? `Limit reached (${usage})` : "Order limit reached"}
          </Text>
        );
      }
      const step = line.qty_step > 0 ? line.qty_step : 1;
      const qty = cartQty[lineId] ?? 0;
      const qtyText =
        qtyDraft[lineId] ?? (qty === 0 ? "" : String(Number.isInteger(qty) ? qty : qty));
      const canDec = line.orderable && qty > 0;
      const canInc = line.orderable;
      const unitBreakdown = formatOrderUnitBreakdown(
        qty,
        line.uom,
        line.units_per_order_unit > 0 ? line.units_per_order_unit : 1,
        line.units_per_order_uom,
      );
      const windowUsage = formatOrderWindowUsage(line);

      return (
        <View style={styles.qtyBlock}>
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
          {unitBreakdown ? <Text style={styles.orderUnitsMeta}>{unitBreakdown}</Text> : null}
          {windowUsage ? <Text style={styles.orderWindowMeta}>{windowUsage}</Text> : null}
        </View>
      );
    }

    function renderCatalogCard(
      item: OutletProduct | OutletProductVariant,
      isVariant: boolean,
      imageHeight = catalogImageHeight,
    ) {
      const lineId = isVariant
        ? (item as OutletProductVariant).variant_id
        : (item as OutletProduct).product_id;
      const name = item.name;
      const imageUrl = item.image_url;
      const showUnavailable = item.live_qty_gate_enabled && !item.orderable;
      const unitHint = formatPerOrderUnitHint(
        item.units_per_order_unit,
        item.uom,
        item.units_per_order_uom,
      );

      return (
        <View
          style={[
            styles.gridItem,
            { width: gridItemWidth },
            !item.orderable && styles.productRowOff,
          ]}
        >
          <CatalogProductImage
            imageUrl={imageUrl}
            label={name}
            frameHeight={imageHeight}
            onPress={imageUrl ? () => setLightboxUrl(imageUrl) : undefined}
          />
          <View style={styles.gridItemBody}>
            <View style={styles.productNameSlot}>
              <Text style={styles.productName} numberOfLines={2}>
                {name}
              </Text>
            </View>
            <Text style={styles.productMeta}>
              {item.uom} · K{item.unit_cost.toFixed(2)}
            </Text>
            {unitHint ? <Text style={styles.orderUnitsMeta}>{unitHint}</Text> : null}
            <View style={styles.cardControlsSlot}>
              {renderQtyControls(lineId, item, showUnavailable)}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.home,
          {
            paddingTop: screenLayout.paddingTop,
            paddingBottom: screenLayout.paddingBottom,
            paddingHorizontal: screenLayout.paddingHorizontal,
          },
        ]}
      >
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
              <View style={[styles.dashboardUpper, compact && styles.dashboardUpperCompact]}>
                <View style={styles.welcomeBlock}>
                  <Text style={[styles.welcomeLabel, compact && styles.welcomeLabelCompactSize]}>
                    Welcome,
                  </Text>
                  <Text
                    style={[styles.welcomeName, compact && styles.welcomeNameCompact]}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {displayName}
                  </Text>
                </View>
                <Pressable
                  style={[styles.placeOrderBtn, compact && styles.placeOrderBtnCompact, busy && styles.primaryBtnDisabled]}
                  disabled={busy}
                  onPress={() => void onStartOrder()}
                >
                  <Text style={styles.placeOrderBtnText}>Place an Order</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewOrdersBtn, compact && styles.viewOrdersBtnCompact]}
                  onPress={() => setViewOrdersActive(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.viewOrdersBtnText}>View Orders</Text>
                </Pressable>
                <Pressable
                  style={[styles.offloadingBtn, compact && styles.offloadingBtnCompact]}
                  onPress={() => setOffloadingActive(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.offloadingBtnText}>Offloading</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewOrdersBtn, compact && styles.viewOrdersBtnCompact]}
                  onPress={() => setCompletedOrdersActive(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.viewOrdersBtnText}>Completed Orders</Text>
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
                setOrderSummaryActive(false);
                setOrderSummaryPreview(null);
                setOrderFlowActive(false);
                setLightboxUrl(null);
                setQtyDraft({});
              }}
            >
              <Text style={styles.backLinkText}>← Dashboard</Text>
            </Pressable>
            {productsError ? <Text style={styles.error}>{productsError}</Text> : null}
            {orderSummaryActive && orderSummaryPreview ? (
              <OrderSummaryScreen
                outletName={displayName}
                outletCode={profile.outlet_id}
                preview={orderSummaryPreview}
                onBack={() => {
                  setOrderSummaryActive(false);
                  setOrderSummaryPreview(null);
                  setOrderSaveError(null);
                }}
                onSaveOrder={(name, pad) => void onSaveOrderFromSummary(name, pad)}
                saving={orderSaving}
                saveError={orderSaveError}
                contentPaddingBottom={screenLayout.listBottomPad}
              />
            ) : productsLoading ? (
              <View style={styles.productsLoading}>
                <ActivityIndicator size="large" color="#c41e3a" />
              </View>
            ) : (
              <FlatList
                style={styles.productList}
                data={products}
                keyExtractor={(item) => item.product_id}
                numColumns={2}
                columnWrapperStyle={[styles.gridRow, { gap: gridGap }]}
                contentContainerStyle={{ paddingBottom: screenLayout.listBottomPad }}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === "android"}
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                windowSize={7}
                updateCellsBatchingPeriod={48}
                ListEmptyComponent={
                  <Text style={styles.sub}>
                    No products yet. Add them in the portal Products page.
                  </Text>
                }
                ListFooterComponent={
                  <View style={styles.summaryFooter}>
                    <Pressable
                      style={[
                        styles.viewSummaryBtn,
                        (!cartHasItems(cartQty) || summaryLoading || busy) &&
                          styles.viewSummaryBtnDisabled,
                      ]}
                      disabled={!cartHasItems(cartQty) || summaryLoading || busy}
                      onPress={() => void onViewSummary()}
                      accessibilityRole="button"
                      accessibilityLabel="View order summary"
                    >
                      <Text style={styles.viewSummaryBtnText}>
                        {summaryLoading ? "Loading…" : "View Summary"}
                      </Text>
                    </Pressable>
                  </View>
                }
                renderItem={({ item }) => {
                  const hasVariantPicker = item.has_variants && item.variants.length > 0;
                  const showUnavailable =
                    !hasVariantPicker && item.live_qty_gate_enabled && !item.orderable;
                  const unitHint = !hasVariantPicker
                    ? formatPerOrderUnitHint(
                        item.units_per_order_unit,
                        item.uom,
                        item.units_per_order_uom,
                      )
                    : null;

                  return (
                    <View
                      style={[
                        styles.gridItem,
                        { width: gridItemWidth },
                        !item.orderable && !hasVariantPicker && styles.productRowOff,
                      ]}
                    >
                      <CatalogProductImage
                        imageUrl={item.image_url}
                        label={item.name}
                        frameHeight={catalogImageHeight}
                        onPress={
                          item.image_url ? () => setLightboxUrl(item.image_url!) : undefined
                        }
                      />
                      <View style={styles.gridItemBody}>
                        <View style={styles.productNameSlot}>
                          <Text style={styles.productName} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </View>
                        <Text style={styles.productMeta}>
                          {item.uom} · K{item.unit_cost.toFixed(2)}
                        </Text>
                        {unitHint ? <Text style={styles.orderUnitsMeta}>{unitHint}</Text> : null}
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
          <View
            style={[
              styles.variantsModal,
              {
                paddingTop: screenLayout.paddingTop,
                paddingBottom: screenLayout.paddingBottom,
                paddingHorizontal: screenLayout.paddingHorizontal,
              },
            ]}
          >
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
              columnWrapperStyle={[styles.gridRow, { gap: gridGap }]}
              contentContainerStyle={{ paddingBottom: screenLayout.listBottomPad }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={Platform.OS === "android"}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={7}
              renderItem={({ item: variant }) => {
                const parent = variantsModalProduct!;
                return renderCatalogCard(
                  applyParentCatalogToVariant(variant, parent),
                  true,
                );
              }}
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
              style={[styles.lightboxClose, { top: screenLayout.paddingTop + 8 }]}
              onPress={() => setLightboxUrl(null)}
              accessibilityRole="button"
              accessibilityLabel="Close image"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </Modal>
        <ToastBanner message={saveToast} onDismiss={() => setSaveToast(null)} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          paddingTop: screenLayout.paddingTop,
          paddingBottom: screenLayout.paddingBottom,
          paddingHorizontal: screenLayout.compact ? 18 : 22,
        },
      ]}
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
    width: 148,
    height: 148,
    marginBottom: 10,
  },
  home: { flex: 1, backgroundColor: "#fffbf7" },
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
    fontSize: 22,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "center",
    lineHeight: 28,
    width: "100%",
  },
  welcomeLabelCompactSize: { fontSize: 16, marginBottom: 4 },
  welcomeNameCompact: { fontSize: 20, lineHeight: 26 },
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
    paddingHorizontal: 4,
    paddingTop: 48,
  },
  dashboardUpperCompact: {
    paddingTop: 28,
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
    paddingVertical: 16,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: "center",
  },
  placeOrderBtnCompact: {
    paddingVertical: 14,
    minWidth: 200,
  },
  placeOrderBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  viewOrdersBtn: {
    marginTop: 12,
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: "center",
  },
  viewOrdersBtnCompact: { paddingVertical: 12, minWidth: 200 },
  viewOrdersBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  offloadingBtn: {
    marginTop: 12,
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: "center",
  },
  offloadingBtnCompact: { paddingVertical: 12, minWidth: 200 },
  offloadingBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  offloadingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e3a8a",
    textAlign: "center",
    marginTop: 24,
  },
  offloadingLead: {
    fontSize: 14,
    color: "#57534e",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
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
  gridRow: { justifyContent: "space-between", marginBottom: 8 },
  gridItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    flexDirection: "column",
  },
  productRowOff: { opacity: 0.55 },
  gridItemBody: {
    flex: 1,
    minHeight: 100,
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
  qtyBlock: { gap: 4, width: "100%" },
  orderUnitsMeta: { fontSize: 11, color: "#57534e", fontWeight: "600", lineHeight: 14 },
  orderWindowMeta: { fontSize: 10, color: "#78716c", lineHeight: 13 },
  cardControlsSlot: {
    minHeight: 32,
    justifyContent: "center",
  },
  variantsBtn: {
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: "center",
  },
  variantsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  summaryFooter: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: "center",
  },
  viewSummaryBtn: {
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 220,
    alignItems: "center",
  },
  viewSummaryBtnDisabled: { opacity: 0.45 },
  viewSummaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  variantsModal: {
    flex: 1,
    backgroundColor: "#fffbf7",
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
    right: 20,
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}
