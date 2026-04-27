import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement>;

const stroke = { stroke: "currentColor", fill: "none" as const, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function EmployeeNavGlyph({ href, className }: { href: string; className?: string }) {
  const p = { ...stroke, className: `h-5 w-5 shrink-0 ${className ?? ""}` } satisfies GlyphProps;
  switch (href) {
    case "/dashboard":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "/settings/profile":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.5-1.632Z" />
        </svg>
      );
    case "/dashboard/my-files":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M4 7h4l2-2h4l2 2h4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
          <path d="M12 11v6M9 14h6" />
        </svg>
      );
    case "/tasks":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h6" />
        </svg>
      );
    case "/leave":
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden {...p}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
  }
}

export function EmployeeSidebarCollapseGlyph({ collapsed, className }: { collapsed: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`h-5 w-5 shrink-0 ${className ?? ""}`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {collapsed ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
    </svg>
  );
}

export function EmployeeSidebarSignOutGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`h-5 w-5 shrink-0 ${className ?? ""}`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 12H9m0 0 3-3m-3 3 3 3" />
    </svg>
  );
}
