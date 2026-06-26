"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRM_PHRASE = "UNASSIGN_ALL_ASSETS";

export type RegionOption = { id: string; name: string };

type ScopeMode = "region" | "all";

/**
 * Bulk unassign assigned assets — employee portal (Project Manager or portal admin only).
 */
export function BulkUnassignAssetsPanel({
  regions,
  allowOrgWide,
  allScopeLabel = "All regions (organization-wide)",
  apiBase = "/api/assets/bulk-unassign",
}: {
  regions: RegionOption[];
  /** Portal admin: org-wide. PM: all regions in PM scope. */
  allowOrgWide: boolean;
  allScopeLabel?: string;
  apiBase?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>(regions.length === 1 ? "region" : "region");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const q =
        scopeMode === "all"
          ? `${apiBase}?all_regions=1`
          : `${apiBase}?region_id=${encodeURIComponent(regionId)}`;
      const res = await fetch(q);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewCount(null);
        return;
      }
      setPreviewCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [apiBase, regionId, scopeMode]);

  useEffect(() => {
    if (!open) return;
    if (scopeMode === "region" && !regionId) {
      setPreviewCount(0);
      return;
    }
    void loadPreview();
  }, [open, scopeMode, regionId, loadPreview]);

  async function runUnassign() {
    if (phrase.trim() !== CONFIRM_PHRASE) {
      setError(`Type ${CONFIRM_PHRASE} exactly.`);
      return;
    }
    if (scopeMode === "region" && !regionId) {
      setError("Select a region.");
      return;
    }
    setError("");
    setSuccessMessage("");
    setBusy(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: CONFIRM_PHRASE,
          all_regions: scopeMode === "all",
          region_id: scopeMode === "region" ? regionId : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(typeof data.message === "string" ? data.message : "Bulk unassign failed.");
        return;
      }
      const n = typeof data.unassignedCount === "number" ? data.unassignedCount : 0;
      setOpen(false);
      setPhrase("");
      setSuccessMessage(`Unassigned ${n} asset(s). They are now Available for reassignment.`);
      router.refresh();
    } catch {
      setBusy(false);
      setError("Request failed");
    }
  }

  const regionLabel = regions.find((r) => r.id === regionId)?.name ?? "selected region";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-amber-950">Bulk unassign assets</h2>
      <p className="mt-2 text-sm text-amber-900/90">
        Clear all current employee assignments in one step before re-assigning updated assets. Only{" "}
        <strong>Project Manager</strong> and <strong>Admin</strong> can use this.
      </p>

      {successMessage ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
        >
          Unassign all assigned assets…
        </button>
      ) : (
        <div className="mt-4 space-y-4 rounded-lg border border-amber-200 bg-white p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-800">Scope</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="pm-unassign-scope"
                checked={scopeMode === "region"}
                onChange={() => setScopeMode("region")}
              />
              One region
            </label>
            {scopeMode === "region" && (
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="ml-6 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                {regions.length === 0 ? (
                  <option value="">No regions in your scope</option>
                ) : (
                  regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                )}
              </select>
            )}
            {allowOrgWide ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="pm-unassign-scope"
                  checked={scopeMode === "all"}
                  onChange={() => setScopeMode("all")}
                />
                {allScopeLabel}
              </label>
            ) : null}
          </fieldset>

          <p className="text-sm text-zinc-600">
            {previewLoading ? (
              "Counting assigned assets…"
            ) : previewCount != null ? (
              <>
                <strong>{previewCount}</strong> asset(s) will be unassigned
                {scopeMode === "region" ? ` in ${regionLabel}` : ""}.
              </>
            ) : (
              "Could not load preview count."
            )}
          </p>

          <div>
            <label htmlFor="pm-bulk-unassign-confirm" className="mb-1 block text-sm font-medium text-zinc-700">
              Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              id="pm-bulk-unassign-confirm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="w-full max-w-md rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || previewCount === 0}
              onClick={() => void runUnassign()}
              className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
            >
              {busy ? "Unassigning…" : "Unassign now"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setPhrase("");
                setError("");
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
