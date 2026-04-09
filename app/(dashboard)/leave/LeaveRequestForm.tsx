"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Emergency",
  "Unpaid",
  "Marriage",
  "Bereavement",
  "Hajj / Umrah",
  "Other",
] as const;

type GuarantorRow = { id: string; full_name: string; subtitle: string };

export function LeaveRequestForm() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPES[0]);
  const [guarantors, setGuarantors] = useState<GuarantorRow[]>([]);
  const [guarantorId, setGuarantorId] = useState("");
  const [loadingGuarantors, setLoadingGuarantors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGuarantors(true);
      try {
        const res = await fetch("/api/leave/guarantors", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.employees)) {
          setGuarantors(data.employees);
        }
      } finally {
        if (!cancelled) setLoadingGuarantors(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!fromDate || !toDate) {
      setMessage({ type: "error", text: "From date and to date are required." });
      return;
    }
    if (!guarantorId) {
      setMessage({ type: "error", text: "Choose a guarantor from your region." });
      return;
    }
    if (!leaveType.trim()) {
      setMessage({ type: "error", text: "Leave type is required." });
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
          reason: reason || undefined,
          guarantor_employee_id: guarantorId,
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
      setGuarantorId("");
      router.refresh();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-md space-y-4">
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
        <label htmlFor="guarantor" className="mb-1 block text-sm font-medium text-zinc-700">
          Guarantor (same region)
        </label>
        <select
          id="guarantor"
          value={guarantorId}
          onChange={(e) => setGuarantorId(e.target.value)}
          required
          disabled={loadingGuarantors}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">{loadingGuarantors ? "Loading…" : "Select guarantor"}</option>
          {guarantors.map((g) => (
            <option key={g.id} value={g.id}>
              {g.full_name}
              {g.subtitle ? ` — ${g.subtitle}` : ""}
            </option>
          ))}
        </select>
        {!loadingGuarantors && guarantors.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">No other active employees in your region to select as guarantor.</p>
        ) : null}
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
          Reason (optional)
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          placeholder="e.g. Personal, medical, family"
        />
      </div>
      {message ? (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading || loadingGuarantors || guarantors.length === 0}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit leave request"}
      </button>
    </form>
  );
}
