"use client";

import Link from "next/link";
import { useEffect } from "react";

export type LeavePrerequisiteModalState =
  | { open: false }
  | {
      open: true;
      kind: "assigned_items";
      assetCount: number;
      simCount: number;
      vehicleCount: number;
    }
  | {
      open: true;
      kind: "pending_confirmation";
      pendingReturnCount: number;
    };

interface LeaveAssetPrerequisiteModalProps {
  state: LeavePrerequisiteModalState;
  onClose: () => void;
}

export function LeaveAssetPrerequisiteModal({ state, onClose }: LeaveAssetPrerequisiteModalProps) {
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, onClose]);

  if (!state.open) return null;

  const isPending = state.kind === "pending_confirmation";

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
          {isPending ? "Waiting for return confirmation" : "Return assigned equipment first"}
        </h3>
        <p className="mt-2 text-sm text-zinc-600">
          {isPending
            ? "You submitted asset returns but PM has not confirmed them yet. Leave can only be applied after confirmation."
            : "This leave requires all company assets, SIM cards, and vehicles to be returned and confirmed before you can apply."}
        </p>
        {!isPending ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {state.assetCount > 0 ? (
              <li>
                You have <strong>{state.assetCount}</strong> physical asset{state.assetCount === 1 ? "" : "s"} still
                assigned — use <strong>Asset returns</strong> to hand them back.
              </li>
            ) : null}
            {state.simCount > 0 ? (
              <li>
                You have <strong>{state.simCount}</strong> SIM card{state.simCount === 1 ? "" : "s"} still assigned.
              </li>
            ) : null}
            {state.vehicleCount > 0 ? (
              <li>
                You have <strong>{state.vehicleCount}</strong> vehicle{state.vehicleCount === 1 ? "" : "s"} still
                assigned.
              </li>
            ) : null}
            {state.assetCount === 0 && state.simCount === 0 && state.vehicleCount === 0 ? (
              <li>
                You still have assigned items on file. Use <strong>Asset returns</strong> or contact your administrator.
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-700">
            <strong>{state.pendingReturnCount}</strong> return{state.pendingReturnCount === 1 ? "" : "s"} awaiting PM
            confirmation. Project Managers: Admin confirms your returns in the Admin Portal.
          </p>
        )}
        <div className="mt-4 rounded-md border border-amber-100 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
          <strong>Exception:</strong> a single calendar day of <strong>Sick</strong>, <strong>Casual</strong>, or{" "}
          <strong>Emergency</strong> leave does not require returning equipment. Annual, Maternity, Hajj / Umrah, and other
          long vacations do.
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
