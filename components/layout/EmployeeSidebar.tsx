"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Served from `public/New folder/logo.png` (URL-encoded path for the space in the folder name). */
const EMPLOYEE_PORTAL_LOGO = "/New%20folder/black.png";

export type EmployeeNavSection = { label: string; items: { href: string; label: string }[] };

function linkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function EmployeeSidebar({
  sections,
  displayName,
  email,
  mobileOpen,
  onCloseMobile,
}: {
  sections: EmployeeNavSection[];
  displayName: string;
  email: string | null;
  mobileOpen: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();

  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  function handleNav() {
    onCloseMobile?.();
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-slate-800 bg-slate-900 shadow-xl shadow-slate-900/30 transition-transform duration-300 ease-out lg:z-20 lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 bg-black/20 px-4">
        <Link
          href="/dashboard"
          onClick={handleNav}
          className="group flex min-w-0 flex-1 items-center justify-start transition-transform duration-200 hover:scale-[1.02]"
        >
          <span className="relative h-8 w-32 shrink-0">
            <Image
              src={EMPLOYEE_PORTAL_LOGO}
              alt="FTS"
              fill
              className="object-contain object-left brightness-0 invert"
              sizes="128px"
              priority
            />
          </span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-4 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = linkActive(pathname, item.href);
                return (
                  <Link
                    key={`${section.label}-${item.href}-${item.label}`}
                    href={item.href}
                    onClick={handleNav}
                    className={`block rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                      active
                        ? "bg-indigo-600 font-medium text-white shadow-md shadow-indigo-900/25"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10" />

      <div className="shrink-0 px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            {email ? <p className="truncate text-xs text-slate-400">{email}</p> : null}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10" />

      <div className="shrink-0 px-3 py-3">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 transition-colors duration-200 hover:bg-rose-500/20 hover:text-rose-200"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
