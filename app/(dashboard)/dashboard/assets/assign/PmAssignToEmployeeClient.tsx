"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Asset = {
  id: string;
  name: string | null;
  category: string | null;
  model: string | null;
  serial: string | null;
  imei_1: string | null;
  imei_2: string | null;
  status: string;
};
type Assignee = { id: string; label: string };
type AssignMode = "team" | "region";
type ViewerRole = "pm" | "admin";

function matchesSearch(a: Asset, q: string): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = [a.serial, a.model, a.imei_1, a.imei_2, a.name, a.category]
    .map((x) => (x ?? "").toLowerCase())
    .join(" ");
  return tokens.every((t) => hay.includes(t));
}

export function PmAssignToEmployeeClient({
  assets,
  teamAssignees,
  regionAssignees,
  viewerRole = "pm",
}: {
  assets: Asset[];
  teamAssignees: Assignee[];
  regionAssignees: Assignee[];
  viewerRole?: ViewerRole;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AssignMode>("team");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeId, setEmployeeId] = useState("");
  const [activeType, setActiveType] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const assignees = mode === "team" ? teamAssignees : regionAssignees;

  const typeTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) {
      const key = (a.category || "Other").trim() || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return ["All", ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const byType =
      activeType === "All" ? assets : assets.filter((a) => ((a.category || "Other").trim() || "Other") === activeType);
    return byType.filter((a) => matchesSearch(a, search));
  }, [assets, activeType, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    const visibleIds = filteredAssets.map((a) => a.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  function setAssignMode(next: AssignMode) {
    setMode(next);
    setEmployeeId("");
    setError("");
  }

  async function assign() {
    setError("");
    setMessage("");
    if (selected.size === 0) {
      setError("Select at least one asset.");
      return;
    }
    if (!employeeId.trim()) {
      setError("Select an employee.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/assets/assign-pm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_ids: [...selected],
        employee_id: employeeId,
        assignment_mode: mode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.message || "Failed to assign");
      return;
    }
    setMessage(data.message || `Assigned ${data.assigned ?? 0} to employee.`);
    setSelected(new Set());
    setEmployeeId("");
    router.refresh();
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-zinc-600">No available assets in the pool for assignment. Request new assets from Admin or check regional asset pool settings.</p>
      </div>
    );
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

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="min-w-[280px] max-w-xl">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            {mode === "team"
              ? "Team member (DT or Driver/Rigger)"
              : viewerRole === "admin"
                ? "Employee (any region)"
                : "Employee in your regions"}
          </label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
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
          disabled={submitting || selected.size === 0 || !employeeId}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting ? "Assigning…" : `Assign ${selected.size} selected`}
        </button>
        <p className="text-xs text-zinc-500">
          Showing: <span className="font-medium text-zinc-700">{activeType}</span> ({filteredAssets.length}
          {search.trim() ? " matched" : ""})
        </p>
        {assignees.length === 0 && (
          <p className="text-sm text-amber-600">
            {mode === "team"
              ? "No team members in scope. Set teams in Admin or project PM access."
              : "No employees in your regions (or all excluded, e.g. QC)."}
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="assign-asset-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Search
            </label>
            <input
              id="assign-asset-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Serial, model, IMEI, name, or type…"
              className="w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              autoComplete="off"
            />
          </div>
          {search.trim() ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Clear search
            </button>
          ) : null}
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Asset types</p>
        <div className="flex flex-wrap gap-2">
          {typeTabs.map((tab) => {
            const count =
              tab === "All"
                ? assets.length
                : assets.filter((a) => ((a.category || "Other").trim() || "Other") === tab).length;
            const active = tab === activeType;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveType(tab)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-indigo-300 bg-indigo-600 text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {filteredAssets.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          {search.trim()
            ? "No assets match your search. Try another term or clear search."
            : "No assets found in this type."}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={filteredAssets.length > 0 && filteredAssets.every((a) => selected.has(a.id))}
                  onChange={toggleAll}
                  className="rounded border-zinc-300"
                  aria-label="Select all visible"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Serial</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Model</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 1</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 2</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((a) => (
              <tr key={a.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="rounded border-zinc-300" />
                </td>
                <td className="px-4 py-3 font-medium text-zinc-900">{a.serial ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{a.model ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-700">{a.imei_1 ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-700">{a.imei_2 ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-900">{a.name ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-600">{a.category ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
