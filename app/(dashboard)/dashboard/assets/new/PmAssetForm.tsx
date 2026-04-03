"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
export function PmAssetForm({ regionId }: { regionId: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [imei1, setImei1] = useState("");
  const [imei2, setImei2] = useState("");
  const [softwareConnectivity, setSoftwareConnectivity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const showImeiFields = /mobile/i.test(category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category: category.trim(),
        model: model.trim() || null,
        serial: serial.trim() || null,
        imei_1: imei1.trim() || null,
        imei_2: imei2.trim() || null,
        software_connectivity: softwareConnectivity.trim() || null,
        assigned_region_id: regionId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.message || "Failed to add asset");
      return;
    }
    router.push("/dashboard/assets");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Name / label</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="e.g. Dell Latitude 5520" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="e.g. Laptop, GPS, Scanner…"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="e.g. Latitude 5520, SM-G991B (optional)"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Serial number</label>
        <input value={serial} onChange={(e) => setSerial(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" placeholder="Optional" />
      </div>
      {showImeiFields ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">IMEI 1</label>
            <input
              value={imei1}
              onChange={(e) => setImei1(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono"
              placeholder="Phones / cellular"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">IMEI 2</label>
            <input
              value={imei2}
              onChange={(e) => setImei2(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono"
              placeholder="Dual-SIM (optional)"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Software connectivity</label>
        <input
          value={softwareConnectivity}
          onChange={(e) => setSoftwareConnectivity(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="e.g. probe, TEMS, NEMO, PHU"
        />
        <p className="mt-1 text-xs text-zinc-500">Optional. What software or tools this asset is used with.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{saving ? "Adding…" : "Add asset"}</button>
        <button type="button" onClick={() => router.back()} className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
      </div>
    </form>
  );
}
