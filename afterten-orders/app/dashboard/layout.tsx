import { requirePortalAdmin, getCachedWelcomeName } from "@/lib/portal/require-portal-admin";
import { PortalSidebar } from "./PortalSidebar";
import styles from "./portal.module.css";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAdmin();
  const welcomeName = await getCachedWelcomeName(user.id, user.email ?? undefined);

  return (
    <div className={styles.shell}>
      <div className={styles.topBanner} aria-hidden>
        <span className={styles.red} />
        <span className={styles.blue} />
        <span className={styles.green} />
      </div>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>Afterten Portal</span>
        </div>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <PortalSidebar welcomeName={welcomeName} />
          <form action="/auth/signout" method="post" className={styles.signOutWrap}>
            <button type="submit" className={styles.signOutPill}>
              Sign out
            </button>
          </form>
        </aside>
        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}
