"use client";

import { canEmployeeInitiateAssetReturn } from "@/lib/asset-return-eligibility";
import { ReturnAssetButton } from "./ReturnAssetButton";

export type EhsAssignedToolRow = {
  id: string;
  asset_id: string | null;
  name: string;
  en_code: string | null;
  status: string;
  /** Driver/Rigger name when this is a driver wear tool held by DT */
  wornByLabel?: string | null;
};

export function EhsAssignedToolsList({
  title,
  tools,
  emptyLabel,
}: {
  title: string;
  tools: EhsAssignedToolRow[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
      {tools.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 list-none space-y-2 text-sm text-zinc-700">
          {tools.map((a) => {
            const canReturn = canEmployeeInitiateAssetReturn(a.status);
            const labelParts = [a.name, a.asset_id, a.en_code ? `EN ${a.en_code.replace(/^EN\s*/i, "")}` : ""].filter(Boolean);
            const returnLabel = a.wornByLabel
              ? `${labelParts.join(" · ")} (for ${a.wornByLabel})`
              : labelParts.join(" · ");
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-2 last:border-0">
                <span className="font-mono text-xs text-orange-800">{a.asset_id}</span>
                <span className="font-medium">{a.name}</span>
                {a.en_code ? <span className="text-xs text-zinc-500">{a.en_code}</span> : null}
                {a.wornByLabel ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Driver: {a.wornByLabel}</span>
                ) : null}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    canReturn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {a.status.replace(/_/g, " ")}
                </span>
                {canReturn ? (
                  <ReturnAssetButton assetId={a.id} assetCategory="EHS" assetLabel={returnLabel} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
