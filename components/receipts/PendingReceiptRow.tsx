"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PendingReceiptDisplay = {
  id: string;
  resource_type: "asset" | "sim_card" | "vehicle";
  label: string;
  assigned_at: string;
};

export function PendingReceiptRow({ row }: { row: PendingReceiptDisplay }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setError("");
    setLoading(true);
    const res = await fetch(`/api/receipts/${row.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.message === "string" ? data.message : "Could not confirm");
      return;
    }
    setMessage("");
    router.refresh();
  }

  const typeLabel =
    row.resource_type === "asset" ? "Asset" : row.resource_type === "sim_card" ? "SIM" : "Vehicle";

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{typeLabel}</p>
          <p className="mt-1 font-medium text-zinc-900">{row.label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Assigned {new Date(row.assigned_at).toLocaleString()}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-600">
        Confirm you physically received this item. You can add an optional note (e.g. condition on handover).
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Optional confirmation note…"
        rows={2}
        className="mt-2 w-full max-w-lg rounded border border-zinc-300 px-3 py-2 text-sm"
        disabled={loading}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={loading}
        className="mt-3 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {loading ? "Saving…" : "I confirm receipt"}
      </button>
    </li>
  );
}
