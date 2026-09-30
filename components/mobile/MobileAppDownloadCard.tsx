import { FTS_EMPLOYEE_APP_STORE } from "@/lib/mobile-app-links";

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.18 3.01-.8.86-2.12 1.52-3.24 1.43-.13-1.1.4-2.25 1.16-3.05.82-.88 2.22-1.52 3.26-1.39zM20.5 17.18c-.58 1.33-.86 1.92-1.61 3.1-1.05 1.62-2.53 3.64-4.37 3.66-1.63.03-2.05-1.06-4.27-1.05-2.22.01-2.68 1.09-4.31 1.06-1.84-.03-3.25-1.84-4.3-3.46C-.01 17.3-1.1 12.38.9 9.05c1.13-1.88 2.92-2.98 4.59-2.98 1.71 0 2.79 1.1 4.21 1.1 1.37 0 2.2-1.11 4.21-1.11 1.5 0 3.09.82 4.21 2.23-3.7 2.02-3.1 7.3.38 8.89z" />
    </svg>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M3.6 2.9c-.3.2-.5.6-.5 1.1v16c0 .5.2.9.5 1.1l.1.1 9.1-9.1v-.2L3.7 2.8l-.1.1zm11.2 6.4-2.1 2.1 2.1 2.1 4.9-2.8c.6-.3.6-1.1 0-1.4l-4.9-2.8v2.8zM12.2 13.5 10 15.7l5.7 3.3c.5.3 1.1 0 1.3-.4l-4.8-5.1zm-2.2-3.1L4.6 4.7l7.6 4.4-2.2 1.3z" />
    </svg>
  );
}

type Props = {
  /** Compact strip for dense dashboards; default is a full promo card. */
  compact?: boolean;
  /** Soften copy for admin viewers sharing with staff. */
  audience?: "employee" | "admin";
};

export function MobileAppDownloadCard({ compact = false, audience = "employee" }: Props) {
  const title = audience === "admin" ? "FTS Employee mobile app" : "Get the FTS Employee app";
  const blurb =
    audience === "admin"
      ? "Share these links with field staff and project managers — same login as the employee portal."
      : "Manage assets, EHS tools, receipts, leave, and tasks from your phone. Same account as this portal.";

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-teal-200/90 bg-teal-50/60 p-4 sm:p-5"
          : "overflow-hidden rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 shadow-sm sm:p-6"
      }
    >
      <div className={`flex flex-col gap-4 ${compact ? "sm:flex-row sm:items-center sm:justify-between" : "lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="min-w-0 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">Mobile</p>
          <h2 className={`mt-1 font-semibold tracking-tight text-zinc-900 ${compact ? "text-base" : "text-lg sm:text-xl"}`}>
            {title}
          </h2>
          <p className={`mt-1 text-zinc-600 ${compact ? "text-sm" : "text-sm sm:text-base"}`}>{blurb}</p>
        </div>
        <div className="flex flex-wrap gap-2.5 sm:gap-3">
          <a
            href={FTS_EMPLOYEE_APP_STORE.ios.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-white shadow-sm transition hover:bg-zinc-800"
          >
            <AppleGlyph className="h-5 w-5 shrink-0" />
            <span className="text-left leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-300">Download on the</span>
              <span className="block text-sm font-semibold">{FTS_EMPLOYEE_APP_STORE.ios.label}</span>
            </span>
          </a>
          <a
            href={FTS_EMPLOYEE_APP_STORE.android.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-zinc-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/80"
          >
            <PlayGlyph className="h-5 w-5 shrink-0 text-teal-700" />
            <span className="text-left leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Get it on</span>
              <span className="block text-sm font-semibold">{FTS_EMPLOYEE_APP_STORE.android.label}</span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
