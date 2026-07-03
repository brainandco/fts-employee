"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { getEhsToolType, type EhsWearRole } from "@/lib/assets/ehs-tool-catalog";

type EhsAsset = {
  id: string;
  asset_id: string | null;
  name: string | null;
  status: string;
  ehs_tool_type: string | null;
  en_code: string | null;
};

type DtTeam = {
  teamId: string;
  teamName: string;
  dt: { id: string; full_name: string };
  driver: { id: string; full_name: string } | null;
};

function toolTypeKey(a: Pick<EhsAsset, "ehs_tool_type">): string {
  const def = a.ehs_tool_type ? getEhsToolType(a.ehs_tool_type) : undefined;
  return def?.label ?? a.ehs_tool_type ?? "Other";
}

export function PmAssignEhsToolsClient({ assets, dtTeams }: { assets: EhsAsset[]; dtTeams: DtTeam[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teamId, setTeamId] = useState("");
  const [assignWearRole, setAssignWearRole] = useState<EhsWearRole | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const teamOptions: SearchableOption[] = useMemo(
    () =>
      dtTeams.map((t) => ({
        id: t.teamId,
        label: `${t.teamName} — DT: ${t.dt.full_name}${t.driver ? ` · Driver: ${t.driver.full_name}` : ""}`,
      })),
    [dtTeams]
  );

  const selectedTeam = teamId ? dtTeams.find((t) => t.teamId === teamId) : undefined;
  const needsDriver = assignWearRole === "driver_rigger";

  async function submit() {
    setError("");
    setMessage("");
    if (!selectedTeam) {
      setError("Select a team (DT).");
      return;
    }
    if (!assignWearRole) {
      setError("Select whether these tools are for DT or Driver/Rigger.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one EHS tool.");
      return;
    }
    if (needsDriver && !selectedTeam.driver) {
      setError("Driver/Rigger assignment requires a driver on this team.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ehs-tools/assign-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_ids: [...selected],
          dt_employee_id: selectedTeam.dt.id,
          driver_employee_id: selectedTeam.driver?.id ?? null,
          assign_wear_role: assignWearRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Assign failed");
      setMessage(data.message ?? "Assigned.");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <SearchableSelect options={teamOptions} value={teamId} onChange={setTeamId} placeholder="Select team / DT…" />
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Assign as</label>
        <select
          value={assignWearRole}
          onChange={(e) => setAssignWearRole(e.target.value as EhsWearRole | "")}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select wear context…</option>
          <option value="dt">DT wear</option>
          <option value="driver_rigger">Driver / Rigger wear</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Asset ID</th>
              <th className="px-3 py-2">Tool</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.asset_id}</td>
                <td className="px-3 py-2">{toolTypeKey(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? "Assigning…" : `Assign ${selected.size} tool(s)`}
      </button>
    </div>
  );
}
