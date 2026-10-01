"use client";

import { useEffect, useState } from "react";
import { PortalSidebar } from "./PortalSidebar";

const STORAGE_KEY = "afterten-portal-sidebar-open";

type Props = {
  welcomeName: string;
  children: React.ReactNode;
};

export function PortalShell({ welcomeName, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "0") setSidebarOpen(false);
    } catch {
      /* ignore */
    }
    setSidebarReady(true);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div
      className={`at-portal-shell${
        sidebarReady && !sidebarOpen ? " at-portal-sidebarClosed" : ""
      }`}
    >
      <header className="at-portal-header">
        <div className="at-portal-headerInner">
          <p className="at-portal-welcomePulse">
            Welcome <span className="at-portal-welcomePulseName">{welcomeName}</span>
          </p>
        </div>
      </header>
      <div className="at-portal-body">
        <div className="at-portal-bodyFrame">
          <div className="at-portal-sidebarRail">
            <aside className="at-portal-sidebar" aria-hidden={!sidebarOpen}>
              <PortalSidebar />
              <form action="/auth/signout" method="post" className="at-portal-signOutWrap">
                <button type="submit" className="at-portal-signOutPill">
                  Sign out
                </button>
              </form>
            </aside>
            <button
              type="button"
              className="at-portal-edgeTab"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Hide navigation panel" : "Show navigation panel"}
              title={sidebarOpen ? "Hide panel" : "Show panel"}
            >
              <svg className="at-portal-edgeTabWedge" viewBox="0 0 28 88" aria-hidden focusable="false">
                <path className="at-portal-edgeTabWedgeFill" d="M0 14 L28 0 L28 88 L0 74 Z" />
              </svg>
              <span className="at-portal-edgeTabChevron" aria-hidden />
            </button>
          </div>
          <main className="at-portal-main">
            <div className="at-portal-mainInner">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
