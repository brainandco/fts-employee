"use client";

import { useState } from "react";
import { MAX_RESOURCE_PHOTOS, MIN_RESOURCE_PHOTOS } from "@/lib/resource-photos";

export type ResourcePhotoPurpose =
  | "asset-return"
  | "vehicle-return"
  | "receipt-confirmation"
  | "asset-transfer-handover";

export function ReturnHandInPhotos({
  purpose,
  assetId,
  receiptConfirmationId,
  urls,
  onUrlsChange,
  title = "Condition photos",
}: {
  purpose: ResourcePhotoPurpose;
  assetId?: string;
  /** Pending receipt row id (resource_type must be asset). */
  receiptConfirmationId?: string;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  /** Override default heading. */
  title?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | null) {
    if (!file) return;
    if (urls.length >= MAX_RESOURCE_PHOTOS) {
      setError(`At most ${MAX_RESOURCE_PHOTOS} photos.`);
      return;
    }
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("purpose", purpose);
      if (purpose === "asset-return" && assetId) fd.set("asset_id", assetId);
      if (purpose === "receipt-confirmation" && receiptConfirmationId) {
        fd.set("receipt_confirmation_id", receiptConfirmationId);
      }
      if (purpose === "asset-transfer-handover" && assetId) fd.set("asset_id", assetId);
      const res = await fetch("/api/uploads/resource-photo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.message === "string" ? data.message : "Upload failed");
        return;
      }
      if (typeof data.url === "string") onUrlsChange([...urls, data.url]);
    } finally {
      setUploading(false);
    }
  }

  function removeAt(i: number) {
    onUrlsChange(urls.filter((_, j) => j !== i));
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-medium text-zinc-900">
        {title} <span className="text-red-600">*</span>
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        Upload at least {MIN_RESOURCE_PHOTOS} photos showing the current condition (all sides / issues as needed).
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <div key={url + i} className="relative h-16 w-16 overflow-hidden rounded border border-zinc-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-xs text-white"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {urls.length < MAX_RESOURCE_PHOTOS ? (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          className="mt-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            void handleFile(f);
          }}
        />
      ) : null}
      {uploading ? <p className="mt-1 text-xs text-zinc-500">Uploading…</p> : null}
      <p className={`mt-1 text-xs ${urls.length >= MIN_RESOURCE_PHOTOS ? "text-emerald-700" : "text-amber-800"}`}>
        {urls.length} / {MIN_RESOURCE_PHOTOS} minimum
      </p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
