import * as WebBrowser from "expo-web-browser";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupervisorAppReturnUri,
  getSupervisorSupabaseRedirectAllowlistHint,
  getSupervisorSupabaseRedirectUri,
} from "./supervisor-oauth-urls";

WebBrowser.maybeCompleteAuthSession();

const SIGN_IN_TIMEOUT_MS = 120_000;

/** @deprecated Use getSupervisorAppReturnUri — kept for login screen hint. */
export function getSupervisorOAuthRedirectUri(): string {
  return getSupervisorAppReturnUri();
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
  const appReturn = getSupervisorAppReturnUri();
  const redirectTo = getSupervisorSupabaseRedirectUri();

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: "Could not start Google sign-in." };

    const result = await withTimeout(
      WebBrowser.openAuthSessionAsync(data.url, appReturn),
      SIGN_IN_TIMEOUT_MS,
      "Sign-in timed out waiting for the app link after Google.",
    );

    if (result.type !== "success") {
      return {
        error: [
          "Supervisor sign-in did not return to the app.",
          "In Supabase → Auth → Redirect URLs, add:",
          getSupervisorSupabaseRedirectAllowlistHint(),
        ].join("\n"),
      };
    }

    await createSessionFromUrl(supabase, result.url);
    return { error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google sign-in failed.";
    return {
      error: `${msg}\n\nSupabase Redirect URLs:\n${getSupervisorSupabaseRedirectAllowlistHint()}`,
    };
  }
}
