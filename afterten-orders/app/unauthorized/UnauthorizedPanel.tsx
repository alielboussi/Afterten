"use client";

import styles from "./unauthorized.module.css";

export function UnauthorizedPanel({ email }: { email: string | null }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.banner} aria-hidden>
        <span className={styles.red} />
        <span className={styles.blue} />
        <span className={styles.green} />
      </div>
      <main className={styles.card}>
        <h1 className={styles.title}>Access not allowed</h1>
        <p className={styles.body}>
          {email ? (
            <>
              <strong>{email}</strong> is signed in but is not an Afterten portal administrator.
            </>
          ) : (
            <>You are not an Afterten portal administrator.</>
          )}
        </p>
        <p className={styles.hint}>Ask an existing admin to add your account in Supabase.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className={styles.btn}>
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
