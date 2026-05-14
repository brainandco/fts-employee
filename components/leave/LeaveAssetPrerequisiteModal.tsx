"use client";

import Link from "next/link";
import { useEffect } from "react";

interface LeaveAssetPrerequisiteModalProps {
  open: boolean;
  onClose: () => void;
  assetCount: number;
  simCount: number;
}

export function LeaveAssetPrerequisiteModal({
  open,
  onClose,
  assetCount,
  simCount,
}: LeaveAssetPrerequisiteModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-asset-prereq-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="leave-asset-prereq-title" className="text-lg font-semibold text-zinc-900">
          Return assigned equipment first
        </h3>
        <p className="mt-2 text-sm text-zinc-600">
          This leave cannot be submitted while you still have assigned company assets or SIM cards. Finish your returns,
          then submit the request again.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-700">
          {assetCount > 0 ? (
            <li>
              You have <strong>{assetCount}</strong> physical asset{assetCount === 1 ? "" : "s"} still assigned — use{" "}
              <strong>Asset returns</strong> to hand them back.
            </li>
          ) : null}
          {simCount > 0 ? (
            <li>
              You have <strong>{simCount}</strong> SIM card{simCount === 1 ? "" : "s"} still assigned — return them from
              the same area so your record is cleared.
            </li>
          ) : null}
          {assetCount === 0 && simCount === 0 ? (
            <li>You still have assigned items on file. Use <strong>Asset returns</strong> to clear them, or contact your administrator.</li>
          ) : null}
        </ul>
        <div className="mt-4 rounded-md border border-amber-100 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
          <strong>Exception:</strong> a single calendar day of <strong>Sick</strong> or <strong>Casual</strong> leave
          does not require returning equipment first. Multi-day Sick or Casual, and all other leave types, do.
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Got it
          </button>
          <Link
            href="/dashboard/asset-returns"
            onClick={onClose}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Open asset returns
          </Link>
        </div>
      </div>
    </div>
  );
}
