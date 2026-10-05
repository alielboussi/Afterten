import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  getSupervisorSupabaseRedirectUri,
} from "./lib/supervisor-oauth-urls";
import { signInWithGoogle } from "./lib/google-auth";
import { subscribeToNewOutletOrders } from "./lib/order-realtime";
import { OrdersScreen } from "./components/OrdersScreen";
import { ToastBanner } from "./components/ToastBanner";

type Screen = "loading" | "login" | "pending" | "home" | "orders";

function AppShell({ onOrderAlert }: { onOrderAlert: (message: string) => void }) {
  const insets = useSafeAreaInsets();
  const supabase = useMemo(() => (supabaseConfigured() ? createSupabaseClient() : null), []);
  const [screen, setScreen] = useState<Screen>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SupervisorProfile | null>(null);

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
  }, [supabase]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
            Welcome Supervisor <Text style={styles.welcomeName}>{alias}</Text>
          </Text>
          <Pressable
            style={[styles.showOrdersBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => setScreen("orders")}
            accessibilityRole="button"
          >
            <Text style={styles.showOrdersBtnText}>Show orders</Text>
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
          Supabase → Auth → Redirect URLs (add all lines):{"\n"}
          {getSupervisorSupabaseRedirectAllowlistHint()}
          {"\n\n"}
          OAuth redirect_to:{"\n"}
          {getSupervisorSupabaseRedirectUri()}
          {"\n\n"}
          App return link:{"\n"}
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
