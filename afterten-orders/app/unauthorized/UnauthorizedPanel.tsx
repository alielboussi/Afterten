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
              <strong>{email}</strong> is signed in here but is not a <strong>portal administrator</strong>.
            </>
          ) : (
            <>You are not a portal administrator for this website.</>
          )}
        </p>
        <p className={styles.hint}>
          <strong>Supervisor</strong> access is only in the <strong>Afterten Supervisor</strong> mobile app
          (Google sign-in in Expo)—not on this website. After an admin approves you under Dashboard →
          Supervisors, open the supervisor app and tap <strong>Check again</strong> if you still see
          “Awaiting approval”.
        </p>
        <p className={styles.hint}>
          To use this <strong>portal</strong>, an admin must assign <strong>Portal admin</strong> on the
          Dashboard home popup (or Portal Admins).
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className={styles.btn}>
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
