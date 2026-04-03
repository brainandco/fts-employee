"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  asset_id: string;
  from_employee_id: string;
  employee_comment: string;
  created_at: string;
  asset: { id: string; name: string; model: string | null; serial: string | null; imei_1: string | null; imei_2: string | null; category: string } | null;
  from_employee_name: string | null;
};

/** PM queue: same UX as admin AssetReturnsQueue, backed by /api/pm/asset-return-requests. QC can view (canProcess=false). */
export function PmAssetReturnsQueue({ canProcess = true }: { canProcess?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Record<string, "Available" | "Under_Maintenance" | "Damaged">>({});
  const [pmComment, setPmComment] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pm/asset-return-requests");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to load");
        setPending([]);
        return;
      }
      setPending(data.pending ?? []);
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function process(id: string) {
    const dec = decision[id] ?? "Available";
    const pm = (pmComment[id] ?? "").trim();
    if (dec !== "Available" && !pm) {
      setError("Add a comment explaining maintenance or damage.");
      return;
    }
    setError("");
    setProcessingId(id);
    try {
      const res = await fetch(`/api/pm/asset-return-requests/${id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: dec, pm_comment: pm || null }),
      });
      const data = await res.json().catch(() => ({}));
      setProcessingId(null);
      if (!res.ok) {
        setError(data.message || "Failed to process");
        return;
      }
      setDecision((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      setPmComment((c) => {
        const n = { ...c };
        delete n[id];
        return n;
      });
      router.refresh();
      await load();
    } catch {
      setProcessingId(null);
      setError("Failed to process");
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading return queue…</p>;
  if (error && pending.length === 0) return <p className="text-sm text-red-600">{error}</p>;

  if (pending.length === 0) {
    return <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No pending asset returns in your region.</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {pending.map((row) => (
        <div key={row.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-zinc-900">{row.asset?.name ?? "Asset"}</h3>
              <p className="text-sm text-zinc-500">
                {row.asset?.category ?? "—"}
                {row.asset?.model ? ` · Model: ${row.asset.model}` : ""}
                {row.asset?.serial ? ` · Serial: ${row.asset.serial}` : ""}
                {row.asset?.imei_1 ? ` · IMEI 1: ${row.asset.imei_1}` : ""}
                {row.asset?.imei_2 ? ` · IMEI 2: ${row.asset.imei_2}` : ""}
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">Returned by:</span> {row.from_employee_name ?? row.from_employee_id}
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Employee comment:</span> {row.employee_comment}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{new Date(row.created_at).toLocaleString()}</p>
            </div>
          </div>
          {canProcess ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Final status</label>
                <select
                  value={decision[row.id] ?? "Available"}
                  onChange={(e) =>
                    setDecision((d) => ({
                      ...d,
                      [row.id]: e.target.value as "Available" | "Under_Maintenance" | "Damaged",
                    }))
                  }
                  className="w-full max-w-xs rounded border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="Available">Available (back in pool)</option>
                  <option value="Under_Maintenance">Under maintenance</option>
                  <option value="Damaged">Damaged (destroy / discard)</option>
                </select>
              </div>
              <div className="min-w-0 flex-[2]">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Your comment {(decision[row.id] ?? "Available") !== "Available" ? "(required)" : "(optional if Available)"}
                </label>
                <textarea
                  value={pmComment[row.id] ?? ""}
                  onChange={(e) => setPmComment((c) => ({ ...c, [row.id]: e.target.value }))}
                  rows={2}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  placeholder={
                    (decision[row.id] ?? "Available") === "Available"
                      ? "Optional note for the record"
                      : "Required: describe the issue or reason for maintenance/damage"
                  }
                />
              </div>
              <button
                type="button"
                disabled={processingId === row.id}
                onClick={() => process(row.id)}
                className="shrink-0 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {processingId === row.id ? "Saving…" : "Apply"}
              </button>
            </div>
          ) : (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
              PM will set final status here. This view is for handover visibility.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
