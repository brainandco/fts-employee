"use client";

import Link from "next/link";

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  link: string | null;
};

function markRead(id: string) {
  void fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
}

export function NotificationList({ items }: { items: NotificationRow[] }) {
  return (
    <ul className="space-y-3">
      {items.map((n) => {
        const href = n.link?.trim() || null;
        const content = (
          <>
            <p className="font-medium text-zinc-900">{n.title}</p>
            <p className="mt-1 text-sm text-zinc-600">{n.body}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">{new Date(n.created_at).toLocaleString()}</p>
              {href ? (
                <span className="text-xs font-medium text-indigo-700">Open →</span>
              ) : (
                <span className="text-xs text-zinc-400">No link</span>
              )}
            </div>
          </>
        );

        if (href) {
          return (
            <li key={n.id}>
              <Link
                href={href}
                onClick={() => markRead(n.id)}
                className={`block rounded-xl border p-4 transition hover:border-indigo-300 hover:bg-indigo-50/30 ${
                  n.is_read ? "border-zinc-200 bg-white" : "border-indigo-200 bg-indigo-50/40"
                }`}
              >
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li
            key={n.id}
            className={`rounded-xl border p-4 ${n.is_read ? "border-zinc-200 bg-white" : "border-indigo-200 bg-indigo-50/40"}`}
          >
            {content}
          </li>
        );
      })}
    </ul>
  );
}
