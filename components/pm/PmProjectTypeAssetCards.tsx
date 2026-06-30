import type { PmProjectTypeAssetOverview } from "@/lib/pm/pm-project-type-asset-stats";
import {
  brandAccent,
  brandInitial,
  groupLinesByBrand,
  type PmBrandGroup,
} from "@/lib/pm/pm-brand-grouping";

const BUCKET_STYLES = {
  MS: {
    border: "border-sky-200",
    bg: "bg-gradient-to-br from-sky-50/80 to-white",
    accent: "text-sky-800",
    badge: "bg-sky-100 text-sky-800",
  },
  Rollout: {
    border: "border-amber-200",
    bg: "bg-gradient-to-br from-amber-50/80 to-white",
    accent: "text-amber-900",
    badge: "bg-amber-100 text-amber-900",
  },
  Other: {
    border: "border-violet-200",
    bg: "bg-gradient-to-br from-violet-50/80 to-white",
    accent: "text-violet-900",
    badge: "bg-violet-100 text-violet-900",
  },
} as const;

function ReceiptBadges({
  confirmed,
  pending,
  size = "sm",
}: {
  confirmed: number;
  pending: number;
  size?: "sm" | "xs";
}) {
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full bg-emerald-100 font-semibold text-emerald-800 ${cls}`}>
        {confirmed} confirmed
      </span>
      <span className={`rounded-full bg-amber-100 font-semibold text-amber-800 ${cls}`}>
        {pending} pending
      </span>
    </div>
  );
}

function BrandCard({ group }: { group: PmBrandGroup }) {
  const accent = brandAccent(group.brand);

  return (
    <article
      className={`overflow-hidden rounded-xl border ${accent.border} ${accent.bg} shadow-sm transition-shadow hover:shadow-md`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${accent.dot}`}
          >
            {brandInitial(group.brand)}
          </span>
          <div className="min-w-0">
            <h4 className={`truncate text-base font-bold ${accent.text}`}>{group.brand}</h4>
            <p className="mt-0.5 text-xs text-zinc-500">
              {group.categories.length} categor{group.categories.length === 1 ? "y" : "ies"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-zinc-900">{group.count}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Total</p>
        </div>
      </header>

      <div className="px-4 py-2.5">
        <ReceiptBadges confirmed={group.confirmedCount} pending={group.pendingCount} size="xs" />
      </div>

      <ul className="space-y-2 px-3 pb-3">
        {group.categories.map((cat) => (
          <li
            key={`${group.brand}-${cat.category}`}
            className="rounded-lg border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                  <span className="font-semibold text-zinc-800">{cat.category}</span>
                </div>
                <div className="mt-1.5">
                  <ReceiptBadges confirmed={cat.confirmedCount} pending={cat.pendingCount} size="xs" />
                </div>
                {cat.byAssigner.length > 0 ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                    <span className="font-medium text-zinc-700">Assigned by:</span>{" "}
                    {cat.byAssigner.map((a) => `${a.isYou ? `${a.assignerName} (you)` : a.assignerName} (${a.count})`).join(" · ")}
                  </p>
                ) : null}
                {cat.pendingAssignees.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
                    <span className="font-medium">Receipt pending:</span>{" "}
                    {cat.pendingAssignees.map((a) => a.employeeName).join(", ")}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-bold tabular-nums text-zinc-900">
                {cat.count}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ProjectTypeSection({ bucket }: { bucket: PmProjectTypeAssetOverview["ms"] }) {
  const style = BUCKET_STYLES[bucket.projectType];
  const brandGroups = groupLinesByBrand(bucket.lines);

  return (
    <details
      className={`group rounded-2xl border ${style.border} ${style.bg} p-4 shadow-sm`}
      open={bucket.totalAssets > 0}
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style.badge}`}>
              {bucket.projectType}
            </span>
            <h3 className={`mt-2 text-lg font-bold ${style.accent}`}>{bucket.title}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Employees on {bucket.projectType === "Other" ? "other / unassigned" : bucket.projectType} projects
            </p>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/70 px-4 py-2 text-right shadow-sm">
            <p className="text-3xl font-bold tabular-nums text-zinc-900">{bucket.totalAssets}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Assets</p>
            {bucket.totalAssets > 0 ? (
              <div className="mt-2 flex justify-end">
                <ReceiptBadges confirmed={bucket.confirmedCount} pending={bucket.pendingCount} />
              </div>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-indigo-700 group-open:hidden">
          Tap to view brand cards & category breakdown
        </p>
      </summary>

      <div className="mt-5 border-t border-white/70 pt-5">
        {brandGroups.length === 0 ? (
          <p className="text-sm text-zinc-500">No assigned assets in your region on {bucket.title.toLowerCase()}.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {brandGroups.map((group) => (
              <BrandCard key={group.brand} group={group} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function PmProjectTypeAssetCards({ overview }: { overview: PmProjectTypeAssetOverview }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-white px-5 py-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">Region assignments</p>
        <p className="mt-2 text-sm text-zinc-800">
          <span className="text-2xl font-bold text-zinc-900">{overview.grandTotal}</span>{" "}
          <span className="text-zinc-600">assets in your region</span>
        </p>
        {overview.grandTotal > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ReceiptBadges confirmed={overview.grandConfirmed} pending={overview.grandPending} />
            {overview.yourAssignedCount > 0 ? (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-900">
                {overview.yourAssignedCount} assigned by you
              </span>
            ) : null}
          </div>
        ) : null}
        {overview.byAssigner.length > 0 ? (
          <ul className="mt-4 grid gap-2 border-t border-indigo-100 pt-4 sm:grid-cols-2">
            {overview.byAssigner.map((a) => (
              <li
                key={a.assignerUserId ?? a.assignerName}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-zinc-700"
              >
                <span className="font-medium">
                  {a.isYou ? <span className="font-bold text-indigo-900">{a.assignerName} (you)</span> : a.assignerName}
                </span>
                <span className="tabular-nums text-zinc-600">
                  {a.count} · {a.confirmedCount} ok · {a.pendingCount} pending
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-4">
        <ProjectTypeSection bucket={overview.ms} />
        <ProjectTypeSection bucket={overview.rollout} />
        {overview.other.totalAssets > 0 ? <ProjectTypeSection bucket={overview.other} /> : null}
      </div>
    </div>
  );
}
