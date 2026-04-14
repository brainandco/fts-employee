"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";

type Vehicle = {
  id: string;
  plate_number: string;
  vehicle_type: string | null;
  rent_company: string | null;
  make: string | null;
  model: string | null;
};
type Assignee = { id: string; label: string };

export function PmAssignVehiclesClient({ vehicles, assignees }: { vehicles: Vehicle[]; assignees: Assignee[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeId, setEmployeeId] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const employeeOptions: SearchableOption[] = useMemo(
    () => assignees.map((a) => ({ id: a.id, label: a.label })),
    [assignees]
  );
  const employeeLabel = employeeId ? assignees.find((e) => e.id === employeeId)?.label ?? "" : "";
  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      [v.plate_number, v.vehicle_type, v.rent_company, v.make, v.model]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [vehicles, vehicleQuery]);
  const selectedInView = useMemo(() => filteredVehicles.filter((v) => selected.has(v.id)).length, [filteredVehicles, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visibleIds = filteredVehicles.map((v) => v.id);
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
    if (selected.size === 0) return setError("Select at least one vehicle.");
    setSubmitting(true);
    const res = await fetch("/api/vehicles/assign-pm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_ids: [...selected],
        employee_id: employeeId,
        assignment_mode: "region",
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] max-w-xl flex-1">
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Driver/Rigger or Self DT in your regions
            </label>
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
          <p className="mt-2 text-sm text-amber-600">
            No Driver/Rigger or Self DT in your regions with a free slot, or they already have a vehicle.
          </p>
        )}
        {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No available unassigned vehicles in the pool you can assign.</div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Search vehicles</label>
            <input
              type="search"
              value={vehicleQuery}
              onChange={(e) => setVehicleQuery(e.target.value)}
              placeholder="Search by plate, type, company, make, or model…"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Showing {filteredVehicles.length} of {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}
            </p>
          </div>
          {filteredVehicles.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No vehicles match your search.</div>
          ) : (
            <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedInView > 0 && selectedInView === filteredVehicles.length}
                    onChange={toggleAll}
                    className="rounded border-zinc-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Plate number</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Type</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Rent company</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-700">Make / Model</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => (
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
      )}
    </div>
  );
}
