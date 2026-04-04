"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Vehicle = {
  id: string;
  plate_number: string;
  vehicle_type: string | null;
  rent_company: string | null;
  make: string | null;
  model: string | null;
};
type Assignee = { id: string; label: string };
type AssignMode = "team" | "region";

export function PmAssignVehiclesClient({
  vehicles,
  teamAssignees,
  regionAssignees,
}: {
  vehicles: Vehicle[];
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
    if (selected.size === vehicles.length) setSelected(new Set());
    else setSelected(new Set(vehicles.map((v) => v.id)));
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
    if (selected.size === 0) return setError("Select at least one vehicle.");
    setSubmitting(true);
    const res = await fetch("/api/vehicles/assign-pm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_ids: [...selected],
        employee_id: employeeId,
        assignment_mode: mode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return setError(data.message || "Failed to assign vehicles");
    setMessage(data.message || `Assigned ${data.assigned ?? 0} vehicle(s).`);
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
          <div className="min-w-[260px]">
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              {mode === "team" ? "Team member (Driver/Rigger or Self DT)" : "Driver/Rigger or Self DT in your regions"}
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
              ? "No eligible team drivers in scope, or they already have a vehicle."
              : "No Driver/Rigger or Self DT in your regions with a free slot, or they already have a vehicle."}
          </p>
        )}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No available unassigned vehicles in the pool you can assign.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="w-10 px-4 py-3 text-left">
                  <input type="checkbox" checked={selected.size === vehicles.length} onChange={toggleAll} className="rounded border-zinc-300" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Plate number</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Type</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Rent company</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Make / Model</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="rounded border-zinc-300" />
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{v.plate_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{v.vehicle_type ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{v.rent_company ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{[v.make, v.model].filter(Boolean).join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
