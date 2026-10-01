"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./portal.module.css";

const nav = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/outlet-users", label: "Outlet Users" },
  { href: "/dashboard/admins", label: "Portal Admins" },
];

export function PortalSidebar({ welcomeName }: { welcomeName: string }) {
  const pathname = usePathname();

  return (
    <>
      <div className={styles.welcomeBanner}>
        <span className={styles.welcomeLabel}>Welcome</span>
        <span className={styles.welcomeName}>{welcomeName}</span>
      </div>
      <nav className={styles.nav}>
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={active ? styles.navPillActive : styles.navPill}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
