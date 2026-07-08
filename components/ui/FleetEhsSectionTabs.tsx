"use client";

import Link from "next/link";
import type { FleetEhsTab } from "@/lib/assets/fleet-ehs-tabs";

export function FleetEhsSectionTabs({
  activeTab,
  basePath,
  fleetLabel = "Fleet assets",
  ehsLabel = "EHS tools",
  fleetCount,
  ehsCount,
}: {
  activeTab: FleetEhsTab;
  basePath: string;
  fleetLabel?: string;
  ehsLabel?: string;
  fleetCount?: number;
  ehsCount?: number;
}) {
  const tabs: { id: FleetEhsTab; label: string; count?: number }[] = [
    { id: "fleet", label: fleetLabel, count: fleetCount },
    { id: "ehs", label: ehsLabel, count: ehsCount },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-zinc-200">
      {tabs.map((t) => {
        const active = activeTab === t.id;
        return (
          <Link
            key={t.id}
            href={`${basePath}?tab=${t.id}`}
            className={`-mb-px rounded-t-lg border px-4 py-2.5 text-sm font-medium transition ${
              active
                ? t.id === "ehs"
                  ? "border-orange-200 border-b-white bg-white text-orange-900"
                  : "border-indigo-200 border-b-white bg-white text-indigo-900"
                : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 text-xs opacity-70">({t.count})</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
