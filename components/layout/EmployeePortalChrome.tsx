"use client";

import { useEffect, useState } from "react";
import { EmployeeSidebar, type EmployeeNavSection } from "./EmployeeSidebar";
import { EmployeeTopBar } from "./EmployeeTopBar";

const SIDEBAR_COLLAPSED_KEY = "fts-employee-sidebar-collapsed";

export function EmployeePortalChrome({
  children,
  navSections,
  displayName,
  email,
  avatarUrl,
  roleBadge,
  unreadNotifications,
  showOpenAdmin,
  adminPortalUrl,
}: {
  children: React.ReactNode;
  navSections: EmployeeNavSection[];
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
  roleBadge: string;
  unreadNotifications: number;
  showOpenAdmin: boolean;
  adminPortalUrl: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Single wrapper: .fts-app-shell > * { position: relative } must not apply to the sidebar or it overrides position:fixed.
  return (
    <div className={`relative min-h-dvh w-full ${sidebarCollapsed ? "fts-sidebar-collapsed" : ""}`}>
      <EmployeeSidebar
        sections={navSections}
        displayName={displayName}
        email={email}
        avatarUrl={avatarUrl}
        positionLabel={roleBadge}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />

      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <div className="fts-dashboard-column">
        <EmployeeTopBar
          displayName={displayName}
          email={email}
          avatarUrl={avatarUrl}
          unreadNotifications={unreadNotifications}
          onOpenMenu={() => setMobileOpen(true)}
          showOpenAdmin={showOpenAdmin}
          adminPortalUrl={adminPortalUrl}
          roleBadge={roleBadge}
        />
        <main className="fts-dashboard-scroll px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
