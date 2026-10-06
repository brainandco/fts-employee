"use client";

import type { DriverEhsBlock, EhsToolLine } from "@/lib/assets/load-driver-ehs-assignments";

function ToolRows({ tools }: { tools: EhsToolLine[] }) {
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

export function DriverEhsToolsPanel({ drivers }: { drivers: DriverEhsBlock[] }) {
  if (drivers.length === 0) {
    return (
      <p className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-sm text-zinc-500">
        No EHS tools currently assigned to Driver/Riggers in this view.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {drivers.map((driver) => (
        <article key={driver.employeeId} className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
          <header className="mb-3 border-b border-orange-100 pb-2">
            <h3 className="font-semibold text-zinc-900">{driver.full_name}</h3>
            <p className="text-xs text-zinc-500">{driver.regionLabel}</p>
          </header>
          <ToolRows tools={driver.tools} />
        </article>
      ))}
    </div>
  );
}
