"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { recordPortalPageView } from "@/app/dashboard/audit/actions";

export function PortalPageAuditTracker() {
  const pathname = usePathname();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname?.startsWith("/dashboard")) return;
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;
    void recordPortalPageView(pathname);
  }, [pathname]);

  return null;
}
