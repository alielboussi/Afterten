import styles from "./dashboard-template.module.css";

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className={styles.enter}>{children}</div>;
}
