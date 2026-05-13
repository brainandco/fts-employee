"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Casual",
  "Emergency",
  "Unpaid",
  "Marriage",
  "Bereavement",
  "Hajj / Umrah",
  "Other",
] as const;

export function LeaveRequestForm() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPES[0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!fromDate || !toDate) {
      setMessage({ type: "error", text: "From date and to date are required." });
      return;
    }
    if (!leaveType.trim()) {
      setMessage({ type: "error", text: "Leave type is required." });
      return;
    }
    if (!reason.trim()) {
      setMessage({ type: "error", text: "Reason is required." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_date: fromDate,
          to_date: toDate,
          reason: reason.trim(),
          leave_type: leaveType.trim(),
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.message ?? "Failed to submit" });
        return;
      }
      setMessage({ type: "success", text: "Leave request submitted. You can see it in the list below." });
      setFromDate("");
      setToDate("");
      setReason("");
      router.refresh();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-md space-y-4">
      <div className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
        <strong>Assets:</strong> except for a <strong>single-day Sick or Casual</strong> request, you must return all
        assigned assets and SIM cards before applying. Multi-day Sick or Casual, and any other leave type, require a
        clear assignment first.
      </div>
      <div>
        <label htmlFor="leave_type" className="mb-1 block text-sm font-medium text-zinc-700">
          Leave type
        </label>
        <select
          id="leave_type"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="from_date" className="mb-1 block text-sm font-medium text-zinc-700">
          From date
        </label>
        <input
          id="from_date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="to_date" className="mb-1 block text-sm font-medium text-zinc-700">
          To date
        </label>
        <input
          id="to_date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium text-zinc-700">
          Reason <span className="text-red-600">*</span>
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Required — e.g. personal, medical, family"
        />
      </div>
      {message ? (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit leave request"}
      </button>
    </form>
  );
}
