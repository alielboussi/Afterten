import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createSupabaseClient,
  registerAndFetchSupervisorProfile,
  supabaseConfigured,
  supervisorDisplayName,
  type SupervisorProfile,
} from "./lib/supabase";
import {
  getSupervisorAppReturnUri,
  getSupervisorSupabaseRedirectAllowlistHint,
} from "./lib/supervisor-oauth-urls";
import { signInWithGoogle } from "./lib/google-auth";
import { subscribeToNewOutletOrders } from "./lib/order-realtime";
import { registerSupervisorPushNotifications } from "./lib/supervisor-push";
import { DeliveryLoadingChecklistScreen } from "./components/DeliveryLoadingChecklistScreen";
import { DeliveryDriverHandoffScreen } from "./components/DeliveryDriverHandoffScreen";
import { OrdersScreen } from "./components/OrdersScreen";
import { SupervisorOrderDetailScreen } from "./components/SupervisorOrderDetailScreen";
import { CompletedOrdersScreen } from "./components/CompletedOrdersScreen";
import { CompletedOrderDetailScreen } from "./components/CompletedOrderDetailScreen";
import { SupervisorReturnDetailScreen } from "./components/SupervisorReturnDetailScreen";
import { SupervisorReturnsScreen } from "./components/SupervisorReturnsScreen";
import { ToastBanner } from "./components/ToastBanner";

type Screen =
  | "loading"
  | "login"
  | "pending"
  | "home"
  | "orders"
  | "orderDetail"
  | "deliveryLoading"
  | "deliveryLoadingChecklist"
  | "deliveryLoadingHandoff"
  | "completedOrders"
  | "returns"
  | "returnDetail";

function AppShell({ onOrderAlert }: { onOrderAlert: (message: string) => void }) {
  const insets = useSafeAreaInsets();
  const supabase = useMemo(() => (supabaseConfigured() ? createSupabaseClient() : null), []);
  const [screen, setScreen] = useState<Screen>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SupervisorProfile | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);
  const [deliveryRefreshToken, setDeliveryRefreshToken] = useState(0);
  const [deliveryLoadingOrderId, setDeliveryLoadingOrderId] = useState<string | null>(null);
  const [deliveryToast, setDeliveryToast] = useState<string | null>(null);
  const [completedOrderDetailId, setCompletedOrderDetailId] = useState<string | null>(null);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [returnsRefreshToken, setReturnsRefreshToken] = useState(0);

  const finishOrderAcceptance = useCallback((acceptedOrderId: string) => {
    void acceptedOrderId;
    setSelectedOrderId(null);
    setScreen("orders");
    setOrdersRefreshToken((t) => t + 1);
    setActionToast("Order accepted.");
  }, []);

  const registerPushIfApproved = useCallback(
    (p: SupervisorProfile | null) => {
      if (!supabase || !p?.approved) return;
      void registerSupervisorPushNotifications(supabase).then((r) => {
        if (!r.ok && r.reason.includes("permission")) {
          setActionToast("Enable notifications to get new order alerts when the app is closed.");
        }
      });
    },
    [supabase],
  );

  const bootstrap = useCallback(async () => {
    if (!supabase) {
      setScreen("login");
      setError("Add supervisor-mobile/.env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setScreen("login");
      return;
    }
    const { profile: p, error: profileError } = await registerAndFetchSupervisorProfile(supabase);
    if (profileError || !p) {
      setError(profileError ?? "Could not load profile.");
      setScreen("login");
      return;
    }
    setProfile(p);
    setScreen(p.approved ? "home" : "pending");
    registerPushIfApproved(p);
  }, [supabase, registerPushIfApproved]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!supabase || !profile?.approved) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") registerPushIfApproved(profile);
    });
    return () => sub.remove();
  }, [supabase, profile, registerPushIfApproved]);

  useEffect(() => {
    if (!supabase || !profile?.approved) return;
    return subscribeToNewOutletOrders(supabase, onOrderAlert);
  }, [supabase, profile?.approved, onOrderAlert]);

  async function onGoogleSignIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await signInWithGoogle(supabase);
    if (signInError) {
      setBusy(false);
      setError(signInError);
      return;
    }
    const { profile: p, error: profileError } = await registerAndFetchSupervisorProfile(supabase);
    setBusy(false);
    if (profileError || !p) {
      setError(profileError ?? "Could not load profile.");
      return;
    }
    setProfile(p);
    setScreen(p.approved ? "home" : "pending");
    registerPushIfApproved(p);
  }

  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setScreen("login");
  }

  const contentPaddingBottom = Math.max(insets.bottom, 16) + 12;

  if (screen === "loading") {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color="#c41e3a" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "orderDetail" && supabase && profile?.approved && selectedOrderId) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <SupervisorOrderDetailScreen
          supabase={supabase}
          orderId={selectedOrderId}
          onBack={() => {
            setSelectedOrderId(null);
            setScreen("orders");
          }}
          onAccepted={() => finishOrderAcceptance(selectedOrderId)}
          contentPaddingBottom={contentPaddingBottom}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "deliveryLoadingHandoff" && supabase && profile?.approved && deliveryLoadingOrderId) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <DeliveryDriverHandoffScreen
          supabase={supabase}
          orderId={deliveryLoadingOrderId}
          supervisorLabel={supervisorDisplayName(profile)}
          onBack={() => {
            setDeliveryLoadingOrderId(null);
            setScreen("deliveryLoading");
          }}
          onComplete={(message) => {
            setDeliveryToast(message);
            setDeliveryLoadingOrderId(null);
            setDeliveryRefreshToken((t) => t + 1);
            setScreen("deliveryLoading");
          }}
          contentPaddingBottom={contentPaddingBottom}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "deliveryLoadingChecklist" && supabase && profile?.approved && deliveryLoadingOrderId) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <DeliveryLoadingChecklistScreen
          supabase={supabase}
          orderId={deliveryLoadingOrderId}
          onBack={() => {
            setDeliveryLoadingOrderId(null);
            setScreen("deliveryLoading");
          }}
          onConfirmed={() => {
            setDeliveryLoadingOrderId(null);
            setDeliveryRefreshToken((t) => t + 1);
            setDeliveryToast("Loading checklist confirmed. You can now sign driver handoff.");
            setScreen("deliveryLoading");
          }}
          onToast={setDeliveryToast}
          contentPaddingBottom={contentPaddingBottom}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "deliveryLoading" && supabase && profile?.approved) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <OrdersScreen
          supabase={supabase}
          onBack={() => setScreen("home")}
          contentPaddingBottom={contentPaddingBottom}
          statusFilter="accepted"
          refreshToken={deliveryRefreshToken}
          deliveryLoadingMode
          onOpenLoadingChecklist={(orderId) => {
            setDeliveryLoadingOrderId(orderId);
            setScreen("deliveryLoadingChecklist");
          }}
          onOpenDriverHandoff={(orderId) => {
            setDeliveryLoadingOrderId(orderId);
            setScreen("deliveryLoadingHandoff");
          }}
          onDeliveryToast={setDeliveryToast}
          title="Delivery Loading"
          subtitle="Tick items loaded, then capture driver name and signature."
        />
        <ToastBanner message={deliveryToast} onDismiss={() => setDeliveryToast(null)} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "completedOrders" && supabase && profile?.approved) {
    if (completedOrderDetailId) {
      return (
        <View
          style={[
            styles.home,
            { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
          ]}
        >
          <CompletedOrderDetailScreen
            supabase={supabase}
            orderId={completedOrderDetailId}
            onBack={() => setCompletedOrderDetailId(null)}
            onToast={setActionToast}
            contentPaddingBottom={contentPaddingBottom}
          />
          <ToastBanner message={actionToast} onDismiss={() => setActionToast(null)} />
          <StatusBar style="auto" />
        </View>
      );
    }
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <CompletedOrdersScreen
          supabase={supabase}
          onBack={() => {
            setCompletedOrderDetailId(null);
            setScreen("home");
          }}
          onOpenDetail={(id) => setCompletedOrderDetailId(id)}
          onToast={setActionToast}
          contentPaddingBottom={contentPaddingBottom}
        />
        <ToastBanner message={actionToast} onDismiss={() => setActionToast(null)} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "returnDetail" && supabase && profile?.approved && selectedReturnId) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <SupervisorReturnDetailScreen
          supabase={supabase}
          returnId={selectedReturnId}
          onBack={() => {
            setSelectedReturnId(null);
            setScreen("returns");
          }}
          onDecided={(message) => {
            setSelectedReturnId(null);
            setReturnsRefreshToken((t) => t + 1);
            setActionToast(message);
            setScreen("returns");
          }}
          contentPaddingBottom={contentPaddingBottom}
        />
        <ToastBanner message={actionToast} onDismiss={() => setActionToast(null)} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "returns" && supabase && profile?.approved) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <SupervisorReturnsScreen
          supabase={supabase}
          onBack={() => setScreen("home")}
          contentPaddingBottom={contentPaddingBottom}
          refreshToken={returnsRefreshToken}
          onOpenReturn={(id) => {
            setSelectedReturnId(id);
            setScreen("returnDetail");
          }}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "orders" && supabase && profile?.approved) {
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <OrdersScreen
          supabase={supabase}
          onBack={() => setScreen("home")}
          contentPaddingBottom={contentPaddingBottom}
          statusFilter="placed"
          refreshToken={ordersRefreshToken}
          onOpenOrder={(orderId) => {
            setSelectedOrderId(orderId);
            setScreen("orderDetail");
          }}
        />
        <ToastBanner
          message={actionToast}
          title="Order accepted"
          onDismiss={() => setActionToast(null)}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "home" && profile?.approved) {
    const alias = supervisorDisplayName(profile);
    return (
      <View
        style={[
          styles.home,
          { paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => void onSignOut()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
        <View style={styles.dashboardUpper}>
          <Text style={styles.welcomeLine}>
            Welcome <Text style={styles.welcomeName}>{alias}</Text>
          </Text>
          <Pressable
            style={[styles.showOrdersBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => setScreen("orders")}
            accessibilityRole="button"
          >
            <Text style={styles.showOrdersBtnText}>Show orders</Text>
          </Pressable>
          <Pressable
            style={[styles.showOrdersBtn, styles.dashboardSecondBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => setScreen("deliveryLoading")}
            accessibilityRole="button"
          >
            <Text style={styles.showOrdersBtnText}>Delivery Loading</Text>
          </Pressable>
          <Pressable
            style={[styles.showOrdersBtn, styles.dashboardSecondBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => setScreen("returns")}
            accessibilityRole="button"
          >
            <Text style={styles.showOrdersBtnText}>Returns</Text>
          </Pressable>
          <Pressable
            style={[styles.showOrdersBtn, styles.dashboardSecondBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => setScreen("completedOrders")}
            accessibilityRole="button"
          >
            <Text style={styles.showOrdersBtnText}>Completed Orders</Text>
          </Pressable>
        </View>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "pending" && profile) {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 22 },
        ]}
      >
        <Text style={styles.title}>Awaiting approval</Text>
        <Text style={styles.sub}>
          Signed in as {profile.email}. A portal admin must set your alias and approve you under
          Dashboard → Supervisors before you can view orders.
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => void bootstrap()}>
          <Text style={styles.secondaryBtnText}>Check again</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => void onSignOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 22 },
      ]}
    >
      <View style={styles.loginHeader}>
        <Image
          source={require("./assets/afterten-logo.png")}
          style={styles.loginLogo}
          resizeMode="contain"
          accessibilityLabel="Afterten"
        />
        <Text style={styles.title}>Afterten Supervisor</Text>
      </View>

      {error ? (
        <Text style={[styles.error, styles.loginError]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.sub}>
        View outlet orders placed from the Afterten Orders app. Sign in with your Google account.
      </Text>

      {__DEV__ ? (
        <Text selectable style={styles.devHint}>
          Supabase (supervisor only — one line):{"\n"}
          {getSupervisorSupabaseRedirectAllowlistHint()}
          {"\n\n"}
          App return link (automatic; do not add to Supabase):{"\n"}
          {getSupervisorAppReturnUri()}
        </Text>
      ) : null}

      <Pressable
        style={[styles.googleBtn, busy && styles.primaryBtnDisabled]}
        disabled={busy}
        onPress={() => void onGoogleSignIn()}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#292524" />
        ) : (
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        )}
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  const [orderAlert, setOrderAlert] = useState<string | null>(null);

  return (
    <SafeAreaProvider>
      <AppShell onOrderAlert={setOrderAlert} />
      <ToastBanner message={orderAlert} onDismiss={() => setOrderAlert(null)} />
    </SafeAreaProvider>
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
  home: { flex: 1, backgroundColor: "#fffbf7" },
  loginHeader: {
    alignItems: "center",
    marginBottom: 20,
    width: "100%",
    maxWidth: 360,
  },
  loginLogo: { width: 148, height: 148, marginBottom: 10 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#292524",
    textAlign: "center",
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: "#57534e",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 360,
  },
  googleBtn: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
  },
  googleBtnText: { color: "#292524", fontWeight: "700", fontSize: 16 },
  topBar: { flexDirection: "row", justifyContent: "flex-end", minHeight: 36, marginBottom: 8 },
  dashboardUpper: { alignItems: "center", paddingTop: 48, paddingHorizontal: 8 },
  welcomeLine: {
    fontSize: 20,
    fontWeight: "600",
    color: "#57534e",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  welcomeName: {
    fontWeight: "700",
    color: "#1e3a8a",
  },
  showOrdersBtn: {
    backgroundColor: "#c41e3a",
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: "center",
  },
  showOrdersBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  dashboardSecondBtn: { marginTop: 12 },
  secondaryBtn: {
    backgroundColor: "#1e3a8a",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  secondaryBtnText: { color: "#fff", fontWeight: "600" },
  linkBtn: { padding: 8 },
  signOutText: { color: "#c41e3a", fontWeight: "600", fontSize: 14 },
  primaryBtnDisabled: { opacity: 0.6 },
  error: { color: "#b91c1c", marginBottom: 12, lineHeight: 20, paddingHorizontal: 8 },
  loginError: { textAlign: "center", width: "100%", maxWidth: 360 },
  devHint: {
    fontSize: 11,
    color: "#78716c",
    lineHeight: 16,
    marginBottom: 16,
    paddingHorizontal: 4,
    textAlign: "center",
  },
});
