"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestReturnClient({
  regionEmployees,
}: {
  regionEmployees: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!targetId || !message.trim()) {
      setError("Choose an employee and enter a message.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/qc/request-employee-return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_employee_id: targetId, message: message.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || "Request failed");
      return;
    }
    setDone(true);
    setMessage("");
    setTargetId("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-zinc-600">
        Ask a field employee to return all assigned assets, their vehicle, and SIM cards through the Employee Portal before they leave the team or you replace them in Admin.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Employee in your region</label>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          required
        >
          <option value="">— Select —</option>
          {regionEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="e.g. Please return all tools, SIM, and vehicle keys to the office by Friday."
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">Notification sent to the employee.</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
