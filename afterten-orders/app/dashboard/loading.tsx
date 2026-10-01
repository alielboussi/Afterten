import styles from "./dashboard-template.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.loadingWrap} aria-live="polite" aria-busy="true">
      <div className={styles.loadingBar} />
      <p className={styles.loadingText}>Loading…</p>
    </div>
  );
}
