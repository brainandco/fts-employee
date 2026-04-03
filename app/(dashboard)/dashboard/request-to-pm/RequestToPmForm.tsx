"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AssetOption = { id: string; name: string; serial: string | null; category: string; assigned_to_employee_id: string; assigned_name: string };
type EmployeeOption = { id: string; full_name: string };

export function RequestToPmForm({
  assets,
  employees,
  reasons,
}: {
  assets: AssetOption[];
  employees: EmployeeOption[];
  reasons: readonly string[];
}) {
  const router = useRouter();
  const [assetId, setAssetId] = useState("");
  const [forEmployeeId, setForEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedAsset = assets.find((a) => a.id === assetId);
  const defaultForEmployee = selectedAsset?.assigned_to_employee_id ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const empId = forEmployeeId || defaultForEmployee;
    if (!assetId || !empId || !reason.trim()) {
      setError("Select an asset, employee, and reason.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/asset-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: assetId,
        for_employee_id: empId,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.message || "Failed to submit request");
      return;
    }
    setAssetId("");
    setForEmployeeId("");
    setReason("");
    setNotes("");
    router.refresh();
  }

  if (assets.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No assigned assets in your region. When an asset is assigned to you or an employee and is not OK for use, you can request the PM here.</p>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Asset (not OK for use)</label>
        <select value={assetId} onChange={(e) => { setAssetId(e.target.value); setForEmployeeId(""); }} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— Select asset</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>{a.name}{a.serial ? ` (${a.serial})` : ""} — with {a.assigned_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Employee who needs replacement</label>
        <select value={forEmployeeId || defaultForEmployee} onChange={(e) => setForEmployeeId(e.target.value)} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— Select employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— Select reason</option>
          {reasons.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Details for the PM" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
        {submitting ? "Sending…" : "Send request to PM"}
      </button>
    </form>
  );
}
