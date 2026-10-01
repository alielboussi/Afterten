"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

type Props = {
  errorCode?: string | null;
};

export function LoginForm({ errorCode }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback`;
  }, []);

  async function onEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function onGoogleLogin() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: { prompt: "select_account" },
      },
    });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  const bootError =
    errorCode === "auth_callback"
      ? "Sign-in could not be completed. Try again."
      : errorCode === "not_authorized"
        ? "Your account is not a portal administrator."
        : errorCode
          ? "Something went wrong."
          : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.banner} aria-hidden>
        <span className={styles.stripeRed} />
        <span className={styles.stripeBlue} />
        <span className={styles.stripeGreen} />
      </div>

      <main className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Afterten Portal</h1>
          <p className={styles.sub}>Sign in to manage outlet orders</p>
        </header>

        {(bootError || message) && (
          <p className={styles.error} role="alert">
            {bootError || message}
          </p>
        )}

        <button type="button" className={styles.googleBtn} onClick={onGoogleLogin} disabled={busy}>
          <GoogleIcon />
          Continue with Google
        </button>

        <div className={styles.divider}>
          <span>or email</span>
        </div>

        <form className={styles.form} onSubmit={onEmailLogin}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.273 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.896 6.053 29.13 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.896 6.053 29.13 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.006 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.896 6.053 29.13 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
