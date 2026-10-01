import Link from "next/link";
import { requirePortalAdmin } from "@/lib/portal/require-portal-admin";
import styles from "./portal.module.css";

const nav = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/admins", label: "Portal admins" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAdmin();

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
          <span className={styles.userEmail}>{user.email}</span>
        </div>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/auth/signout" method="post" className={styles.signOutWrap}>
            <button type="submit" className={styles.signOut}>
              Sign out
            </button>
          </form>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
