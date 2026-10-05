import * as WebBrowser from "expo-web-browser";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const DEFAULT_PORTAL_URL = "https://aftertentransfers.app";

/** HTTPS redirect registered in Supabase; Expo WebBrowser completes on this URL. */
export function getSupervisorOAuthRedirectUri(): string {
  const portal = (process.env.EXPO_PUBLIC_PORTAL_URL?.trim() || DEFAULT_PORTAL_URL).replace(/\/$/, "");
  return `${portal}/auth/supervisor-callback`;
}

async function createSessionFromUrl(supabase: SupabaseClient, url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }

  const access_token = params.access_token;
  const refresh_token = params.refresh_token;
  if (!access_token || !refresh_token) {
    throw new Error("Google sign-in did not return a session.");
  }
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

export async function signInWithGoogle(supabase: SupabaseClient): Promise<{ error: string | null }> {
  const redirectTo = getSupervisorOAuthRedirectUri();

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: "Could not start Google sign-in." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") {
      if (result.type === "cancel" || result.type === "dismiss") {
        return {
          error:
            "Sign-in was interrupted. Wait until the browser closes on its own after “Finishing sign-in…”—don’t tap ×.",
        };
      }
      return { error: "Google sign-in failed." };
    }

    await createSessionFromUrl(supabase, result.url);
    return { error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google sign-in failed.";
    return {
      error: `${msg} (Add ${redirectTo} to Supabase → Auth → Redirect URLs.)`,
    };
  }
}
