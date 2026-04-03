"use client";

import { useState } from "react";

export type PpTabAsset = {
  id: string;
  name: string | null;
  serial: string | null;
  category: string | null;
  status: string | null;
};

export type PpTabSim = {
  id: string;
  sim_number: string | null;
  phone_number: string | null;
  status: string | null;
};

export type PpTabVehicle = {
  plate_number: string | null;
  make: string | null;
  model: string | null;
  status: string | null;
};

export type PpTeamMemberTab = {
  tabId: string;
  tabLabel: string;
  /** Slot on the team (shown inside the details panel). */
  roleLabel: string;
  assets: PpTabAsset[];
  sims: PpTabSim[];
  vehicles: PpTabVehicle[];
};

export function PpTeamMemberTabs({ members }: { members: PpTeamMemberTab[] }) {
  const [active, setActive] = useState(0);

  if (members.length === 0) {
    return <p className="p-5 text-sm text-zinc-500">No DT or Driver/Rigger on this team.</p>;
  }

  const safeIndex = Math.min(active, members.length - 1);
  const m = members[safeIndex];
  const showTools = m.roleLabel !== "Driver/Rigger";

  return (
    <div className="p-5 pt-4">
      <div className="flex flex-wrap gap-1 border-b border-zinc-200" role="tablist" aria-label="Team members">
        {members.map((mem, idx) => {
          const selected = idx === safeIndex;
          return (
            <button
              key={mem.tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`tab-${mem.tabId}`}
              aria-controls={`panel-${mem.tabId}`}
              aria-label={`${mem.tabLabel}, ${mem.roleLabel}`}
              onClick={() => setActive(idx)}
              className={`relative -mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border border-b-0 border-zinc-200 bg-white text-teal-900 shadow-sm"
                  : "border border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              {mem.tabLabel}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${m.tabId}`}
        aria-labelledby={`tab-${m.tabId}`}
        className="mt-4 space-y-6"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-4">
          <span className="text-sm text-zinc-600">Role on this team</span>
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900">
            {m.roleLabel}
          </span>
        </div>

        {showTools ? (
          <section>
            <h3 className="text-sm font-medium text-zinc-800">Tools</h3>
            {m.assets.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No tools assigned.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
                {m.assets.map((a) => (
                  <li key={a.id} className="border-b border-zinc-100 pb-1.5 last:border-0">
                    <span className="font-medium">{a.name ?? a.serial ?? a.id}</span>
                    {a.serial ? <span className="text-zinc-500"> · {a.serial}</span> : null}
                    <span className="text-zinc-500"> — {a.status ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section>
          <h3 className="text-sm font-medium text-zinc-800">SIMs</h3>
          {m.sims.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No SIM assigned.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {m.sims.map((s) => (
                <li key={s.id}>
                  {s.sim_number ?? "—"}
                  {s.phone_number ? <span className="text-zinc-500"> · {s.phone_number}</span> : null}
                  {s.status ? <span className="text-zinc-500"> — {s.status}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-medium text-zinc-800">Vehicles</h3>
          {m.vehicles.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No vehicle assignment.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {m.vehicles.map((v, i) => (
                <li key={`${m.tabId}-v-${i}`}>
                  <span className="font-medium">{v.plate_number ?? "—"}</span>
                  {(v.make || v.model) && (
                    <span className="text-zinc-500"> — {[v.make, v.model].filter(Boolean).join(" ")}</span>
                  )}
                  {v.status ? <span className="text-zinc-500"> ({v.status})</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
