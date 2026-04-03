"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestAssetForm() {
  const router = useRouter();
  const [assetName, setAssetName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState("Normal");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    const res = await fetch("/api/assets/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_name: assetName.trim(),
        category: category.trim(),
        quantity,
        priority,
        reason: reason.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.message || "Failed to submit request");
      return;
    }
    setSuccess(data.message || "Request submitted.");
    setAssetName("");
    setCategory("");
    setQuantity(1);
    setPriority("Normal");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="fts-surface max-w-2xl space-y-4 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Asset name</label>
          <input value={assetName} onChange={(e) => setAssetName(e.target.value)} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="e.g. Samsung S24 Ultra" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="e.g. Mobile, Laptop, Internet Device" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Quantity</label>
          <input type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
            <option>Low</option>
            <option>Normal</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Reason / business need</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={4} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Why do you need this asset and for which activity/team?" />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "Submitting..." : "Submit request to admin"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard/assets")} className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Back to assets
        </button>
      </div>
    </form>
  );
}
