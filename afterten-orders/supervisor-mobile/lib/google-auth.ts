import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const SIGN_IN_TIMEOUT_MS = 120_000;

/**
 * Deep link Supabase must redirect to. On Android, openAuthSessionAsync only completes
 * when Linking receives this URL — an HTTPS portal URL will never return to the app.
 */
export function getSupervisorOAuthRedirectUri(): string {
  return makeRedirectUri({
    scheme: "afterten-supervisor",
    path: "auth/callback",
  });
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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

    const result = await withTimeout(
      WebBrowser.openAuthSessionAsync(data.url, redirectTo),
      SIGN_IN_TIMEOUT_MS,
      "Sign-in timed out. Confirm this redirect URL is in Supabase → Auth → Redirect URLs.",
    );

    if (result.type !== "success") {
      if (result.type === "cancel" || result.type === "dismiss") {
        return {
          error: `Sign-in did not finish. Add this redirect URL in Supabase Auth settings: ${redirectTo}`,
        };
      }
      return { error: "Google sign-in failed." };
    }

    await createSessionFromUrl(supabase, result.url);
    return { error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google sign-in failed.";
    return {
      error: `${msg} Redirect URL: ${redirectTo}`,
    };
  }
}
