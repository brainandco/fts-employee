"use client";

import { canEmployeeInitiateAssetReturn } from "@/lib/asset-return-eligibility";
import { ReturnAssetButton } from "./ReturnAssetButton";

export type AssignedAssetRow = {
  id: string;
  name: string;
  category: string | null;
  serial: string | null;
  model?: string | null;
  imei_1?: string | null;
  imei_2?: string | null;
  status: string;
};

export function AssignedAssetsList({ assets }: { assets: AssignedAssetRow[] }) {
  if (assets.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">No assets assigned.</p>;
  }

  return (
    <ul className="mt-2 list-none space-y-2 text-sm text-zinc-700">
      {assets.map((a) => {
        const canReturn = canEmployeeInitiateAssetReturn(a.status);
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-2 last:border-0">
            <span className="font-medium">{a.name}</span>
            {a.category && <span className="text-zinc-500">— {a.category}</span>}
            {a.model && <span className="text-zinc-500"> · {a.model}</span>}
            {a.serial && <span className="text-zinc-500">({a.serial})</span>}
            {a.imei_1 && <span className="text-zinc-500"> · IMEI1 {a.imei_1}</span>}
            {a.imei_2 && <span className="text-zinc-500"> · IMEI2 {a.imei_2}</span>}
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                canReturn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {a.status}
            </span>
            {canReturn ? (
              <ReturnAssetButton
                assetId={a.id}
                assetLabel={[a.name, a.model, a.serial, a.imei_1 ? `IMEI1 ${a.imei_1}` : "", a.imei_2 ? `IMEI2 ${a.imei_2}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
