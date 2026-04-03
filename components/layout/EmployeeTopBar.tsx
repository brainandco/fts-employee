"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBellDropdown } from "@/components/notifications/NotificationBellDropdown";
import { UserAvatar } from "@/components/profile/UserAvatar";

const TITLE_MAP: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/admin-overview": "All employees",
  "/dashboard/region-employees-assets": "Who has assets",
  "/dashboard/assets/assign": "Assign assets",
  "/dashboard/sims/assign": "Assign SIMs",
  "/dashboard/vehicles/assign": "Assign vehicles",
  "/dashboard/assets/request": "Request asset",
  "/dashboard/requests-from-qc": "QC requests",
  "/dashboard/request-to-pm": "Request to PM",
  "/dashboard/qc/request-returns": "Request returns",
  "/dashboard/transfer-requests": "Transfer requests",
  "/dashboard/notifications": "Notifications",
  "/tasks": "My tasks",
  "/leave": "Leave",
  "/settings/profile": "Profile settings",
};

function titleCaseSegment(s: string) {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getPageTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  const trimmed = pathname.replace(/\/$/, "") || "/";
  if (TITLE_MAP[trimmed]) return TITLE_MAP[trimmed];

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "Dashboard";

  if (parts[0] === "dashboard" && parts.length >= 2) {
    const rest = parts.slice(1);
    if (rest[0] === "assets" && rest[1] === "assign") return "Assign assets";
    if (rest[0] === "sims" && rest[1] === "assign") return "Assign SIMs";
    if (rest[0] === "vehicles" && rest[1] === "assign") return "Assign vehicles";
    if (rest[0] === "asset-returns") return "Asset returns";
    return titleCaseSegment(rest.join(" / "));
  }
  if (parts[0] === "tasks") return "My tasks";
  return titleCaseSegment(parts[parts.length - 1] ?? "Portal");
}

export function EmployeeTopBar({
  displayName,
  email,
  avatarUrl,
  unreadNotifications,
  onOpenMenu,
  showOpenAdmin,
  adminPortalUrl,
  roleBadge,
}: {
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
  unreadNotifications: number;
  onOpenMenu: () => void;
  showOpenAdmin: boolean;
  adminPortalUrl: string;
  roleBadge: string;
}) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [unread, setUnread] = useState(unreadNotifications);

  useEffect(() => {
    setUnread(unreadNotifications);
  }, [unreadNotifications]);

  return (
    <header className="fts-dashboard-topbar z-20 px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 lg:hidden"
        aria-label="Open navigation menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-indigo-600">
          Employee portal
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">· {roleBadge}</span>
        </p>
        <div className="truncate text-lg font-semibold leading-tight tracking-tight text-slate-900 sm:text-xl">
          {title}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex" aria-hidden>
        <UserAvatar name={displayName} email={email} avatarUrl={avatarUrl} size="sm" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showOpenAdmin && (
          <a
            href={adminPortalUrl}
            className="inline-flex max-w-[7rem] shrink-0 truncate rounded-full bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-indigo-500/25 transition-transform hover:scale-105 sm:max-w-none sm:px-3 sm:text-xs"
          >
            Open admin
          </a>
        )}
        <NotificationBellDropdown
          unreadCount={unread}
          onUnreadDecrement={() => setUnread((c) => Math.max(0, c - 1))}
        />
      </div>
    </header>
  );
}
