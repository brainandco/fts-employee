"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type RecentNotification = {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  link: string | null;
};

function markReadApi(id: string) {
  return fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export function NotificationBellDropdown({
  unreadCount,
  onUnreadDecrement,
  viewAllHref = "/dashboard/notifications",
}: {
  unreadCount: number;
  onUnreadDecrement: () => void;
  /** Full notifications page (admin uses `/notifications`). */
  viewAllHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const updatePanelPos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [open, updatePanelPos]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/notifications/recent?limit=10");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not load");
        setItems([]);
        return;
      }
      setItems(data.notifications ?? []);
    } catch {
      setError("Could not load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleItemClick(n: RecentNotification, hasLink: boolean) {
    if (!n.is_read) {
      void markReadApi(n.id);
      onUnreadDecrement();
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (hasLink) setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed z-[100] w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-black/5"
          style={{ top: panelPos.top, right: panelPos.right }}
          role="dialog"
          aria-label="Recent notifications"
        >
          <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-600">Latest updates for your account</p>
          </div>

          <div className="max-h-[min(70vh,20rem)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : error ? (
              <p className="px-4 py-6 text-center text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => {
                  const href = n.link?.trim() || null;
                  const rowClass = `block px-4 py-3 text-left transition ${
                    n.is_read ? "bg-white hover:bg-slate-50" : "bg-indigo-50/50 hover:bg-indigo-50/80"
                  }`;

                  const inner = (
                    <>
                      <div className="flex items-start gap-2">
                        {!n.is_read ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </>
                  );

                  if (href) {
                    return (
                      <li key={n.id}>
                        <Link
                          href={href}
                          className={rowClass}
                          onClick={() => handleItemClick(n, true)}
                        >
                          {inner}
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`${rowClass} w-full`}
                        onClick={() => handleItemClick(n, false)}
                      >
                        {inner}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/80 p-2">
            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              View more
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
