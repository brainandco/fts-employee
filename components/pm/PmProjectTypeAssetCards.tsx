import type { PmProjectTypeAssetOverview } from "@/lib/pm/pm-project-type-asset-stats";

const CARD_STYLES = {
  MS: {
    border: "border-sky-200",
    bg: "bg-sky-50/50",
    accent: "text-sky-800",
    chip: "border-sky-100 bg-white",
  },
  Rollout: {
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    accent: "text-amber-900",
    chip: "border-amber-100 bg-white",
  },
  Other: {
    border: "border-violet-200",
    bg: "bg-violet-50/50",
    accent: "text-violet-900",
    chip: "border-violet-100 bg-white",
  },
} as const;

function ProjectTypeCard({ bucket }: { bucket: PmProjectTypeAssetOverview["ms"] }) {
  const style = CARD_STYLES[bucket.projectType];

  return (
    <details className={`group rounded-xl border ${style.border} ${style.bg} p-4`} open={bucket.totalAssets > 0}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${style.accent}`}>{bucket.title}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Assets you assigned · employees on {bucket.projectType === "Other" ? "other / unassigned" : bucket.projectType}{" "}
              projects
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold text-zinc-900">{bucket.totalAssets}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Total assigned</p>
            {bucket.totalAssets > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-600">
                <span className="font-semibold text-emerald-700">{bucket.confirmedCount} confirmed</span>
                {" · "}
                <span className="font-semibold text-amber-700">{bucket.pendingCount} pending</span>
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs font-medium text-indigo-700 group-open:hidden">
          Tap for brand & category breakdown with receipt status
        </p>
      </summary>

      <div className="mt-4 border-t border-white/80 pt-4">
        {bucket.lines.length === 0 ? (
          <p className="text-sm text-zinc-500">No assets you assigned on {bucket.title.toLowerCase()}.</p>
        ) : (
          <ul className="space-y-2">
            {bucket.lines.map((line) => (
              <li
                key={`${line.brand}-${line.category}`}
                className={`rounded-lg border px-3 py-2 text-sm ${style.chip}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium text-zinc-800">{line.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{line.count}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  <span className="font-medium text-emerald-700">{line.confirmedCount} confirmed</span>
                  {" · "}
                  <span className="font-medium text-amber-700">{line.pendingCount} pending receipt</span>
                </p>
                {line.pendingAssignees.length > 0 ? (
                  <p className="mt-1.5 text-xs text-amber-900">
                    Pending on:{" "}
                    <span className="font-medium">{line.pendingAssignees.map((a) => a.employeeName).join(", ")}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function PmProjectTypeAssetCards({ overview }: { overview: PmProjectTypeAssetOverview }) {
  return (
    <div className="mt-4">
      <div className="rounded-xl border border-indigo-200 bg-white/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Your assignments — receipt status</p>
        <p className="mt-1 text-sm text-zinc-800">
          <span className="font-semibold">{overview.grandTotal}</span> assets you assigned in your region
          {overview.grandTotal > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-emerald-700">{overview.grandConfirmed} confirmed</span>
              {" · "}
              <span className="font-semibold text-amber-700">{overview.grandPending} pending</span>
            </>
          ) : null}
        </p>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Grouped by employee project (MS / Rollout / Other) and by brand + category. Counts include every asset you
        assigned — not split by individual model.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <ProjectTypeCard bucket={overview.ms} />
        <ProjectTypeCard bucket={overview.rollout} />
        <ProjectTypeCard bucket={overview.other} />
      </div>
    </div>
  );
}
