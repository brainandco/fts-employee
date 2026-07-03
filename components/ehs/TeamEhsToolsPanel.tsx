"use client";

import type { TeamEhsBlock } from "@/lib/assets/load-team-ehs-assignments";

function ToolRows({ tools }: { tools: TeamEhsBlock["dtTools"] }) {
  if (tools.length === 0) return <p className="text-xs text-zinc-500">None</p>;
  return (
    <ul className="space-y-0.5 text-xs text-zinc-700">
      {tools.map((t) => (
        <li key={t.id}>
          <span className="font-mono text-orange-800">{t.asset_id}</span> — {t.name}
        </li>
      ))}
    </ul>
  );
}

export function TeamEhsToolsPanel({ teams }: { teams: TeamEhsBlock[] }) {
  if (teams.length === 0) {
    return (
      <p className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-sm text-zinc-500">
        No EHS tools assigned on teams in this view yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {teams.map((team) => (
        <article key={team.teamId} className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
          <header className="mb-3 border-b border-orange-100 pb-2">
            <h3 className="font-semibold text-zinc-900">{team.teamName}</h3>
            <p className="text-xs text-zinc-500">{team.regionLabel}</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                DT — {team.dt.full_name}
              </p>
              <ToolRows tools={team.dtTools} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Driver/Rigger — {team.driver?.full_name ?? "—"}
              </p>
              <ToolRows tools={team.driverTools} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
