"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReturnVehicleButton({ plateLabel }: { plateLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const c = comment.trim();
    if (!c) {
      setError("Describe handover / vehicle condition (required).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/employee-returns/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_comment: c }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setError(data.message || "Return failed");
        return;
      }
      setOpen(false);
      setComment("");
      router.refresh();
    } catch {
      setLoading(false);
      setError("Something went wrong");
    }
  }

  return (
    <div className="inline">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
          setComment("");
        }}
        className="ml-2 rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
      >
        Return vehicle
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">Return vehicle</h3>
            <p className="mt-1 text-sm text-zinc-600">{plateLabel}</p>
            <p className="mt-3 text-sm text-zinc-600">
              Confirm you are handing the vehicle back to QC / operations. Add keys, condition, mileage, or issues (required).
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="e.g. Keys handed to QC, no new damage…"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={submit}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "Submitting…" : "Confirm return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
