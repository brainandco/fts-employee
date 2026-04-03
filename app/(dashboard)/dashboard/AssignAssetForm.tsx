"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Asset = { id: string; name: string; category?: string | null; serial?: string | null };
type Employee = { id: string; full_name: string; email?: string | null };

export function AssignAssetForm({
  assets,
  regionEmployees,
}: {
  assets: Asset[];
  regionEmployees: Employee[];
}) {
  const router = useRouter();
  const [assetId, setAssetId] = useState("");
  const [toEmployeeId, setToEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!assetId || !toEmployeeId) {
      setMessage({ type: "error", text: "Select an asset and an employee." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/assign-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId, to_employee_id: toEmployeeId }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.message ?? "Failed to assign" });
        return;
      }
      setMessage({ type: "success", text: "Asset assigned successfully." });
      setAssetId("");
      setToEmployeeId("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (assets.length === 0 || regionEmployees.length === 0) return null;

  return (
    <form onSubmit={submit} className="mt-4 max-w-md space-y-4">
      <div>
        <label htmlFor="assign_asset" className="mb-1 block text-sm font-medium text-zinc-700">Asset to assign</label>
        <select
          id="assign_asset"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select asset</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.serial ? ` (${a.serial})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign_employee" className="mb-1 block text-sm font-medium text-zinc-700">Assign to employee</label>
        <select
          id="assign_employee"
          value={toEmployeeId}
          onChange={(e) => setToEmployeeId(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select employee</option>
          {regionEmployees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </div>
      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Assigning…" : "Assign asset to employee"}
      </button>
    </form>
  );
}
