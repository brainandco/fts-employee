"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Sim = {
  id: string;
  operator: string;
  service_type: string;
  sim_number: string;
  phone_number: string | null;
};
type Assignee = { id: string; label: string };
type AssignMode = "team" | "region";

export function PmAssignSimsClient({
  sims,
  teamAssignees,
  regionAssignees,
}: {
  sims: Sim[];
  teamAssignees: Assignee[];
  regionAssignees: Assignee[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AssignMode>("team");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeId, setEmployeeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const assignees = mode === "team" ? teamAssignees : regionAssignees;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sims.length) setSelected(new Set());
    else setSelected(new Set(sims.map((s) => s.id)));
  };

  function setAssignMode(next: AssignMode) {
    setMode(next);
    setEmployeeId("");
    setError("");
  }

  async function assign() {
    setError("");
    setMessage("");
    if (!employeeId) return setError("Select an employee.");
    if (selected.size === 0) return setError("Select at least one SIM.");
    setSubmitting(true);
    const res = await fetch("/api/sims/assign-pm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sim_ids: [...selected],
        employee_id: employeeId,
        assignment_mode: mode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return setError(data.message || "Failed to assign SIMs");
    setMessage(data.message || `Assigned ${data.assigned ?? 0} SIM(s).`);
    setSelected(new Set());
    setEmployeeId("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assign to</span>
        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
          <button
            type="button"
            onClick={() => setAssignMode("team")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "team" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            By team
          </button>
          <button
            type="button"
            onClick={() => setAssignMode("region")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "region" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            By region
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]">
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              {mode === "team" ? "Team member (DT or Driver/Rigger)" : "Employee in your regions"}
            </label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full max-w-xl rounded border border-zinc-300 px-3 py-2 text-sm">
              <option value="">{mode === "team" ? "— Select team member" : "— Select employee"}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={assign}
            disabled={submitting || !employeeId || selected.size === 0}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Assigning..." : `Assign ${selected.size} selected`}
          </button>
        </div>
        {assignees.length === 0 && (
          <p className="mt-2 text-sm text-amber-600">
            {mode === "team"
              ? "No team members in scope."
              : "No employees in your regions (or all excluded, e.g. QC)."}
          </p>
        )}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {sims.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No available SIMs.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="w-10 px-4 py-3 text-left">
                  <input type="checkbox" checked={selected.size === sims.length} onChange={toggleAll} className="rounded border-zinc-300" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">SIM number</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Operator</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Service</th>
              </tr>
            </thead>
            <tbody>
              {sims.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="rounded border-zinc-300" />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800">{s.sim_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{s.phone_number ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{s.operator}</td>
                  <td className="px-4 py-3 text-zinc-700">{s.service_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
