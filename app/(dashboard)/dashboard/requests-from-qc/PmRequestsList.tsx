"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Asset = { id: string; name: string; serial: string | null; category?: string };
export type RequestItem = {
  id: string;
  asset_id: string;
  for_employee_id: string;
  reason: string;
  notes: string | null;
  status: string;
  created_at: string;
  assets: Asset | null;
  for_employee: { id: string; full_name: string } | null;
  requested_by: { id: string; full_name: string } | null;
  replacement_asset: Asset | null;
};

export function PmRequestsList({
  requests,
  availableAssets,
}: {
  requests: RequestItem[];
  availableAssets: Asset[];
}) {
  const router = useRouter();
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [replacementAssetId, setReplacementAssetId] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function fulfill(requestId: string) {
    if (!replacementAssetId.trim()) {
      setError("Select a replacement asset.");
      return;
    }
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/asset-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Fulfilled", replacement_asset_id: replacementAssetId }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.message || "Failed to fulfill");
      return;
    }
    setFulfillingId(null);
    setReplacementAssetId("");
    router.refresh();
  }

  async function reject(requestId: string) {
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/asset-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Rejected" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "Failed to reject");
      return;
    }
    setRejectingId(null);
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "Pending");
  const resolved = requests.filter((r) => r.status !== "Pending");

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No pending requests.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900">Asset: {r.assets?.name ?? "—"}{r.assets?.serial ? ` (${r.assets.serial})` : ""}</p>
                    <p className="text-sm text-zinc-600">For: {r.for_employee?.full_name ?? "—"}</p>
                    <p className="text-sm text-zinc-600">Requested by QC: {r.requested_by?.full_name ?? "—"}</p>
                    <p className="mt-1 text-sm text-zinc-700">Reason: {r.reason}</p>
                    {r.notes && <p className="text-sm text-zinc-500">Notes: {r.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    {fulfillingId === r.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={replacementAssetId}
                          onChange={(e) => setReplacementAssetId(e.target.value)}
                          className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        >
                          <option value="">— Select replacement</option>
                          {availableAssets.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}{a.serial ? ` (${a.serial})` : ""}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => fulfill(r.id)}
                          disabled={submitting || !replacementAssetId}
                          className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Confirm assign
                        </button>
                        <button type="button" onClick={() => { setFulfillingId(null); setReplacementAssetId(""); setError(""); }} className="rounded border border-zinc-300 px-3 py-1 text-sm">Cancel</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setFulfillingId(r.id); setReplacementAssetId(""); setError(""); }}
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                      >
                        Fulfill (assign replacement)
                      </button>
                    )}
                    {rejectingId === r.id ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => reject(r.id)} disabled={submitting} className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50">Confirm reject</button>
                        <button type="button" onClick={() => setRejectingId(null)} className="rounded border border-zinc-300 px-3 py-1 text-sm">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setRejectingId(r.id)} className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">Reject</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-zinc-900">Resolved</h2>
          <ul className="space-y-2">
            {resolved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/50 px-4 py-3 text-sm">
                <span className="text-zinc-900">{r.assets?.name ?? "—"} → {r.for_employee?.full_name ?? "—"} ({r.reason})</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  r.status === "Fulfilled" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"
                }`}>
                  {r.status}
                  {r.replacement_asset && ` — ${r.replacement_asset.name}${r.replacement_asset.serial ? ` (${r.replacement_asset.serial})` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
