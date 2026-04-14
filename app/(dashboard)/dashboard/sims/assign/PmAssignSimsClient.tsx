"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";

type Sim = {
  id: string;
  operator: string;
  service_type: string;
  sim_number: string;
  phone_number: string | null;
};
type Assignee = { id: string; label: string };

export function PmAssignSimsClient({ sims, assignees }: { sims: Sim[]; assignees: Assignee[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeId, setEmployeeId] = useState("");
  const [simQuery, setSimQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const employeeOptions: SearchableOption[] = useMemo(
    () => assignees.map((a) => ({ id: a.id, label: a.label })),
    [assignees]
  );
  const employeeLabel = employeeId ? assignees.find((e) => e.id === employeeId)?.label ?? "" : "";
  const filteredSims = useMemo(() => {
    const q = simQuery.trim().toLowerCase();
    if (!q) return sims;
    return sims.filter((s) =>
      [s.sim_number, s.phone_number, s.operator, s.service_type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [sims, simQuery]);
  const selectedInView = useMemo(() => filteredSims.filter((s) => selected.has(s.id)).length, [filteredSims, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visibleIds = filteredSims.map((s) => s.id);
    if (visibleIds.length === 0) return;
    const allVisibleSelected = visibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

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
        assignment_mode: "region",
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] max-w-xl flex-1">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Employee in your regions</label>
            <SearchableSelect
              options={employeeOptions}
              value={employeeLabel}
              onChange={(_value, option) => {
                if (option) setEmployeeId(option.id);
              }}
              placeholder="Type to search or select employee…"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              listClassName="max-h-72"
            />
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
          <p className="mt-2 text-sm text-amber-600">No employees in your regions (or all excluded, e.g. QC).</p>
        )}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {sims.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No available SIMs.</div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Search SIMs</label>
            <input
              type="search"
              value={simQuery}
              onChange={(e) => setSimQuery(e.target.value)}
              placeholder="Search by SIM number, phone, operator, or service…"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Showing {filteredSims.length} of {sims.length} SIM{sims.length === 1 ? "" : "s"}
            </p>
          </div>
          {filteredSims.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No SIMs match your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedInView > 0 && selectedInView === filteredSims.length}
                        onChange={toggleAll}
                        className="rounded border-zinc-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700">SIM number</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700">Phone</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700">Operator</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700">Service</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSims.map((s) => (
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
      )}
    </div>
  );
}
