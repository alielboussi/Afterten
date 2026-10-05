import { makeRedirectUri } from "expo-auth-session";

const DEFAULT_PORTAL_URL = "https://aftertentransfers.app";

/** Deep link the Expo app listens for (Android Linking / openAuthSessionAsync). */
export function getSupervisorAppReturnUri(): string {
  return makeRedirectUri({
    scheme: "afterten-supervisor",
    path: "auth/callback",
  });
}

function getPortalBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_PORTAL_URL?.trim() || DEFAULT_PORTAL_URL).replace(/\/$/, "");
}

/**
 * Supabase OAuth redirect_to — must be on the Supabase Redirect URLs allowlist.
 * Uses the portal bridge page so Supabase never falls back to the site root (/ → unauthorized).
 */
export function getSupervisorSupabaseRedirectUri(): string {
  const appReturn = getSupervisorAppReturnUri();
  const base = `${getPortalBaseUrl()}/auth/supervisor-callback`;
  return `${base}?app_return=${encodeURIComponent(appReturn)}`;
}

/** Shown in dev UI / errors — minimum Supabase Auth → Redirect URLs for supervisor sign-in. */
export function getSupervisorSupabaseRedirectAllowlistHint(): string {
  const portal = getPortalBaseUrl();
  return `${portal}/auth/supervisor-callback**`;
}
