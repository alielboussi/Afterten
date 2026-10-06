"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/logic", label: "Logic" },
  { href: "/dashboard/outlet-users", label: "Outlet Users" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/supervisors", label: "Supervisors" },
  { href: "/dashboard/drivers", label: "Drivers" },
  { href: "/dashboard/admins", label: "Portal Admins" },
  { href: "/dashboard/history", label: "History", historyOnly: true as const },
];

type Props = {
  showHistory: boolean;
};

export function PortalSidebar({ showHistory }: Props) {
  const pathname = usePathname();

  return (
    <nav className="at-portal-nav">
      {nav.map((item) => {
        if ("historyOnly" in item && item.historyOnly && !showHistory) return null;
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={active ? "at-portal-navPillActive" : "at-portal-navPill"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
