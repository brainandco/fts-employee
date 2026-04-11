"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { EmployeeNavGlyph, EmployeeSidebarCollapseGlyph, EmployeeSidebarSignOutGlyph } from "./employee-nav-glyphs";

const EMPLOYEE_PORTAL_LOGO = "/images/black.svg";

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
  avatarUrl,
  positionLabel,
  mobileOpen,
  onCloseMobile,
  collapsed = false,
  onToggleCollapsed,
}: {
  sections: EmployeeNavSection[];
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
  positionLabel: string;
  mobileOpen: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const rail = collapsed;
  const profileTitle = [displayName, email, positionLabel].filter(Boolean).join(" · ");

  function handleNav() {
    onCloseMobile?.();
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-slate-800 bg-slate-900 shadow-xl shadow-slate-900/30 transition-[width] duration-300 ease-out lg:z-20 lg:translate-x-0 ${
        rail ? "lg:w-16" : "lg:w-56"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-1 border-b border-white/10 bg-black/20 px-3 max-lg:h-14 max-lg:min-h-[3.5rem] ${
          rail ? "lg:min-h-0 lg:flex-col lg:justify-center lg:gap-2 lg:py-3" : "h-14 min-h-[3.5rem]"
        }`}
      >
        <Link
          href="/dashboard"
          onClick={handleNav}
          className={`group flex min-w-0 items-center font-semibold text-white transition-transform duration-200 hover:scale-[1.02] ${
            rail ? "lg:w-full lg:justify-center" : "flex-1"
          }`}
        >
          <span className={`relative shrink-0 ${rail ? "h-8 w-32 max-lg:w-32 lg:h-9 lg:w-9" : "h-8 w-32"}`}>
            <Image
              src={EMPLOYEE_PORTAL_LOGO}
              alt="Fast Technology Solutions"
              fill
              sizes="128px"
              className="object-contain object-left brightness-0 invert lg:object-center"
              priority
            />
          </span>
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!rail}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:flex"
        >
          <EmployeeSidebarCollapseGlyph collapsed={rail} />
        </button>
      </div>

      <div className={`shrink-0 border-b border-white/10 ${rail ? "lg:px-2 lg:py-2" : "px-3 py-3"}`}>
        <div
          className={`flex items-center gap-3 rounded-xl bg-white/5 p-2 ring-1 ring-white/10 ${
            rail ? "max-lg:flex-row lg:flex-col lg:items-center lg:justify-center lg:gap-1 lg:p-1.5" : ""
          }`}
          title={rail ? profileTitle : undefined}
        >
          <UserAvatar name={displayName} email={email ?? undefined} avatarUrl={avatarUrl} size="md" />
          <div className={`min-w-0 flex-1 ${rail ? "max-lg:block lg:hidden" : ""}`}>
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            {email ? <p className="truncate text-xs text-slate-400">{email}</p> : null}
            <p className="mt-0.5 truncate text-[11px] font-medium text-teal-300/95">{positionLabel}</p>
          </div>
        </div>
      </div>

      <nav className="fts-nav-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, sIdx) => (
          <div key={section.label} className={`mb-4 last:mb-0 ${sIdx > 0 && rail ? "mt-2 border-t border-white/10 pt-2 max-lg:border-0 max-lg:pt-0 lg:mt-2 lg:border-t lg:pt-2" : ""}`}>
            <p
              className={`mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${
                rail ? "max-lg:mb-1.5 lg:hidden" : ""
              }`}
            >
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = linkActive(pathname, item.href);
                if (rail) {
                  return (
                    <Link
                      key={`${section.label}-${item.href}-${item.label}`}
                      href={item.href}
                      onClick={handleNav}
                      title={item.label}
                      className={`flex justify-center rounded-lg p-2.5 text-sm transition-all duration-200 max-lg:block max-lg:px-3 max-lg:py-2.5 max-lg:text-left lg:mx-auto lg:w-10 ${
                        active
                          ? "bg-teal-600 font-medium text-white shadow-md shadow-teal-900/25"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="hidden lg:contents">
                        <EmployeeNavGlyph href={item.href} className={active ? "text-white" : "text-slate-200"} />
                      </span>
                      <span className="lg:hidden">{item.label}</span>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={`${section.label}-${item.href}-${item.label}`}
                    href={item.href}
                    onClick={handleNav}
                    className={`block rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                      active
                        ? "bg-teal-600 font-medium text-white shadow-md shadow-teal-900/25"
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

      <div className="shrink-0 px-3 py-3">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            title="Sign out"
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 transition-colors duration-200 hover:bg-rose-500/20 hover:text-rose-200 ${
              rail ? "lg:justify-center lg:px-2" : ""
            }`}
          >
            <EmployeeSidebarSignOutGlyph className={`shrink-0 ${rail ? "max-lg:hidden lg:inline" : "hidden"}`} />
            <span className={rail ? "max-lg:inline lg:sr-only" : ""}>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
