"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  title: string;
  description: string | null;
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
};

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SoftwareLibraryClient({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/software/catalog");
    const data = (await res.json().catch(() => ({}))) as { items?: Item[]; message?: string };
    if (!res.ok) {
      setError(data.message ?? "Could not load catalog");
      return;
    }
    if (data.items) setItems(data.items);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function download(id: string) {
    setError("");
    setLoadingId(id);
    try {
      const res = await fetch(`/api/software/${id}/download`);
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Download failed");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                  No software published yet. Admins add files in the admin portal (Software library).
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-zinc-900">{row.title}</div>
                    {row.description ? (
                      <p className="mt-1 text-xs text-zinc-600">{row.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{row.file_name ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">{formatBytes(row.byte_size)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => download(row.id)}
                      disabled={loadingId === row.id}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      {loadingId === row.id ? "…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
