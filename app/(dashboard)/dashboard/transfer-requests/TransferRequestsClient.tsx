"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { REGION_FALLBACK_TEAM_ID } from "@/lib/transfer-requests/constants";

type RequestType = "vehicle_swap" | "vehicle_replacement" | "drive_swap" | "asset_transfer";
type TransferRequest = {
  id: string;
  request_type: RequestType;
  status: "Pending" | "Accepted" | "Rejected";
  requester_employee_id: string;
  requester_region_id: string;
  target_employee_id: string | null;
  target_team_id: string | null;
  asset_id: string | null;
  request_reason: string;
  notes: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type EmployeeOption = { id: string; full_name: string };
type TeamOption = { id: string; name: string; driver_rigger_employee_id: string | null };
type AssetOption = { id: string; name: string; serial: string | null };
type VehicleOption = { id: string; plate_number: string; make: string | null; model: string | null };

type TeamMemberPick = { teamId: string; teamName: string; members: EmployeeOption[] };

function requestTypeLabel(type: RequestType): string {
  if (type === "vehicle_swap") return "Vehicle Swap";
  if (type === "vehicle_replacement") return "Vehicle Replacement";
  if (type === "drive_swap") return "Drive Swap";
  return "Asset Transfer";
}

export function TransferRequestsClient({
  canRequest,
  canReview,
  canRequestAssetTransfer,
  canRequestVehicleFlows,
  meId,
  requests,
  employees,
  vehicleSwapTeams,
  assetTransferTeams,
  teamLabels,
  teams,
  myAssets,
  replacementVehicles,
}: {
  canRequest: boolean;
  canReview: boolean;
  canRequestAssetTransfer: boolean;
  canRequestVehicleFlows: boolean;
  meId: string;
  requests: TransferRequest[];
  employees: EmployeeOption[];
  vehicleSwapTeams: TeamMemberPick[];
  assetTransferTeams: TeamMemberPick[];
  teamLabels: Record<string, string>;
  teams: TeamOption[];
  myAssets: AssetOption[];
  replacementVehicles: VehicleOption[];
}) {
  const router = useRouter();
  const allowedRequestTypes = useMemo<RequestType[]>(() => {
    const types: RequestType[] = [];
    if (canRequestVehicleFlows) types.push("vehicle_swap", "vehicle_replacement", "drive_swap");
    if (canRequestAssetTransfer) types.push("asset_transfer");
    return types;
  }, [canRequestAssetTransfer, canRequestVehicleFlows]);

  const [requestType, setRequestType] = useState<RequestType>(
    canRequestVehicleFlows ? "vehicle_swap" : "asset_transfer"
  );
  const [vehicleTeamId, setVehicleTeamId] = useState("");
  const [assetTeamId, setAssetTeamId] = useState("");
  const [driveSwapTeamId, setDriveSwapTeamId] = useState("");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [replacementVehicleId, setReplacementVehicleId] = useState("");
  const [replacementVehicleSearch, setReplacementVehicleSearch] = useState("");
  const [showVehicleResults, setShowVehicleResults] = useState(false);
  const [reviewerComment, setReviewerComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e.full_name])), [employees]);
  const teamLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.name);
    for (const [id, label] of Object.entries(teamLabels)) m.set(id, label);
    return m;
  }, [teams, teamLabels]);
  const assetMap = useMemo(() => new Map(myAssets.map((a) => [a.id, `${a.name}${a.serial ? ` (${a.serial})` : ""}`])), [myAssets]);
  const vehicleLabel = (v: VehicleOption) => `${v.plate_number}${v.make ? ` - ${v.make}` : ""}${v.model ? ` ${v.model}` : ""}`;
  const filteredReplacementVehicles = useMemo(() => {
    const q = replacementVehicleSearch.trim().toLowerCase();
    if (!q) return replacementVehicles;
    return replacementVehicles.filter((v) => vehicleLabel(v).toLowerCase().includes(q));
  }, [replacementVehicles, replacementVehicleSearch]);
  const selectedReplacementLabel = useMemo(() => {
    const found = replacementVehicles.find((v) => v.id === replacementVehicleId);
    return found ? vehicleLabel(found) : "";
  }, [replacementVehicleId, replacementVehicles]);

  const vehicleMembers = useMemo(() => {
    const row = vehicleSwapTeams.find((t) => t.teamId === vehicleTeamId);
    return row?.members.filter((m) => m.id !== meId) ?? [];
  }, [vehicleSwapTeams, vehicleTeamId, meId]);

  const assetMembers = useMemo(() => {
    const row = assetTransferTeams.find((t) => t.teamId === assetTeamId);
    return row?.members.filter((m) => m.id !== meId) ?? [];
  }, [assetTransferTeams, assetTeamId, meId]);

  useEffect(() => {
    if (!allowedRequestTypes.includes(requestType)) {
      setRequestType(allowedRequestTypes[0] ?? "asset_transfer");
    }
  }, [allowedRequestTypes, requestType]);

  useEffect(() => {
    setVehicleTeamId("");
    setAssetTeamId("");
    setDriveSwapTeamId("");
    setTargetEmployeeId("");
    setAssetId("");
  }, [requestType]);

  useEffect(() => {
    setTargetEmployeeId("");
  }, [vehicleTeamId, assetTeamId]);

  const incoming = useMemo(
    () => requests.filter((r) => r.requester_employee_id !== meId),
    [requests, meId]
  );
  const mine = useMemo(
    () => requests.filter((r) => r.requester_employee_id === meId),
    [requests, meId]
  );

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!reason.trim()) return setFormError("Reason is required.");
    if (requestType === "vehicle_swap") {
      if (!vehicleTeamId) return setFormError("Choose a team first.");
      if (!targetEmployeeId) return setFormError("Choose the driver to swap with.");
    }
    if (requestType === "drive_swap" && !driveSwapTeamId) return setFormError("Choose target team.");
    if (requestType === "asset_transfer") {
      if (!assetTeamId) return setFormError("Choose a team first.");
      if (!targetEmployeeId) return setFormError("Choose the DT receiving the asset.");
      if (!assetId) return setFormError("Select an asset.");
    }
    setSubmitting(true);

    let target_team_id: string | undefined;
    if (requestType === "vehicle_swap") target_team_id = vehicleTeamId;
    else if (requestType === "asset_transfer") target_team_id = assetTeamId;
    else if (requestType === "drive_swap") target_team_id = driveSwapTeamId;

    const res = await fetch("/api/transfer-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: requestType,
        target_employee_id: targetEmployeeId || undefined,
        target_team_id,
        asset_id: assetId || undefined,
        request_reason: reason.trim(),
        notes: notes.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return setFormError(data.message || "Failed to submit request.");
    setReason("");
    setNotes("");
    setVehicleTeamId("");
    setAssetTeamId("");
    setDriveSwapTeamId("");
    setTargetEmployeeId("");
    setAssetId("");
    router.refresh();
  }

  async function reviewRequest(id: string, action: "accept" | "reject", type: RequestType) {
    setReviewError("");
    if (action === "accept" && type === "vehicle_replacement" && !replacementVehicleId) {
      return setReviewError("Select replacement vehicle.");
    }
    setReviewBusy(true);
    const res = await fetch(`/api/transfer-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reviewer_comment: reviewerComment.trim() || undefined,
        replacement_vehicle_id: action === "accept" && type === "vehicle_replacement" ? replacementVehicleId : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setReviewBusy(false);
    if (!res.ok) return setReviewError(data.message || "Failed to process request.");
    setReviewingId(null);
    setReplacementVehicleId("");
    setReplacementVehicleSearch("");
    setShowVehicleResults(false);
    setReviewerComment("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canRequest && (
        <section className="fts-panel p-6">
          <h2 className="text-lg font-semibold text-zinc-900">New transfer request</h2>
          <p className="mt-1 text-sm text-zinc-600">
            For vehicle swap and asset transfer, pick a team first, then the member (driver or DT). Self DT uses the same flow with other teams’ drivers or DTs.
          </p>
          <form onSubmit={submitRequest} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-700">
              Request type
              <select
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as RequestType)}
              >
                {allowedRequestTypes.includes("vehicle_swap") ? <option value="vehicle_swap">Vehicle Swap</option> : null}
                {allowedRequestTypes.includes("vehicle_replacement") ? <option value="vehicle_replacement">Vehicle Replacement</option> : null}
                {allowedRequestTypes.includes("drive_swap") ? <option value="drive_swap">Drive Swap</option> : null}
                {allowedRequestTypes.includes("asset_transfer") ? <option value="asset_transfer">Asset Transfer</option> : null}
              </select>
            </label>

            {requestType === "vehicle_swap" && (
              <>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  Team
                  <select
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                    value={vehicleTeamId}
                    onChange={(e) => setVehicleTeamId(e.target.value)}
                  >
                    <option value="">Select team</option>
                    {vehicleSwapTeams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  Driver (swap with)
                  <select
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                    disabled={!vehicleTeamId}
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                  >
                    <option value="">{vehicleTeamId ? "Select driver" : "Select a team first"}</option>
                    {vehicleMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  {vehicleTeamId === REGION_FALLBACK_TEAM_ID ? (
                    <p className="mt-1 text-xs text-zinc-500">Drivers in your region not listed under a specific team above.</p>
                  ) : null}
                </label>
                {vehicleSwapTeams.length === 0 ? (
                  <p className="text-sm text-amber-700 md:col-span-2">No teams or drivers available for swap in your region.</p>
                ) : null}
              </>
            )}

            {requestType === "asset_transfer" && (
              <>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  Team
                  <select
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                    value={assetTeamId}
                    onChange={(e) => setAssetTeamId(e.target.value)}
                  >
                    <option value="">Select team</option>
                    {assetTransferTeams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  DT receiving the asset
                  <select
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                    disabled={!assetTeamId}
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                  >
                    <option value="">{assetTeamId ? "Select DT" : "Select a team first"}</option>
                    {assetMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  Asset (assigned to you)
                  <select className="mt-1 w-full rounded border border-zinc-300 px-3 py-2" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                    <option value="">Select asset</option>
                    {myAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.serial ? ` (${a.serial})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {assetTransferTeams.length === 0 ? (
                  <p className="text-sm text-amber-700 md:col-span-2">No teams or DTs available for transfer in your region.</p>
                ) : null}
              </>
            )}

            {requestType === "drive_swap" && (
              <label className="text-sm text-zinc-700 md:col-span-2">
                Target team
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                  value={driveSwapTeamId}
                  onChange={(e) => setDriveSwapTeamId(e.target.value)}
                >
                  <option value="">Select team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-sm text-zinc-700 md:col-span-2">
              Reason
              <input
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this transfer is needed"
              />
            </label>
            <label className="text-sm text-zinc-700 md:col-span-2">
              Notes (optional)
              <textarea className="mt-1 w-full rounded border border-zinc-300 px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {formError ? <p className="text-sm text-red-600 md:col-span-2">{formError}</p> : null}
            <div className="md:col-span-2">
              <button disabled={submitting} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit transfer request"}
              </button>
            </div>
          </form>
        </section>
      )}

      {canReview && (
        <section className="fts-panel p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Incoming requests (QC / PM)</h2>
          <div className="mt-4 space-y-3">
            {incoming.length === 0 ? (
              <p className="text-sm text-zinc-500">No incoming requests.</p>
            ) : (
              incoming.map((r) => (
                <article key={r.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm text-zinc-700">
                      <p className="font-medium text-zinc-900">
                        {requestTypeLabel(r.request_type)} • {r.status}
                      </p>
                      <p>Requester: {employeeMap.get(r.requester_employee_id) ?? "—"}</p>
                      {r.target_employee_id ? <p>Target employee: {employeeMap.get(r.target_employee_id) ?? "—"}</p> : null}
                      {r.target_team_id ? <p>Target team: {teamLookup.get(r.target_team_id) ?? "—"}</p> : null}
                      {r.asset_id ? <p>Asset: {assetMap.get(r.asset_id) ?? r.asset_id}</p> : null}
                      <p>Reason: {r.request_reason}</p>
                      {r.notes ? <p>Notes: {r.notes}</p> : null}
                      {r.reviewer_comment ? <p>Reviewer comment: {r.reviewer_comment}</p> : null}
                    </div>
                    {r.status === "Pending" ? (
                      <div className="flex flex-col gap-2">
                        {reviewingId === r.id && r.request_type === "vehicle_replacement" ? (
                          <div className="flex flex-col gap-2">
                            <input
                              className="rounded border border-zinc-300 px-2 py-1 text-sm"
                              placeholder="Search vehicle by plate/make/model"
                              value={replacementVehicleSearch}
                              onChange={(e) => {
                                setReplacementVehicleSearch(e.target.value);
                                setShowVehicleResults(true);
                              }}
                              onFocus={() => setShowVehicleResults(true)}
                            />
                            {selectedReplacementLabel ? <p className="text-xs text-emerald-700">Selected: {selectedReplacementLabel}</p> : null}
                            {showVehicleResults ? (
                              <div className="max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white">
                                {filteredReplacementVehicles.length === 0 ? (
                                  <p className="px-2 py-2 text-xs text-zinc-500">No vehicles match your search.</p>
                                ) : (
                                  filteredReplacementVehicles.map((v) => (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => {
                                        setReplacementVehicleId(v.id);
                                        setReplacementVehicleSearch(vehicleLabel(v));
                                        setShowVehicleResults(false);
                                      }}
                                      className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100 ${
                                        replacementVehicleId === v.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700"
                                      }`}
                                    >
                                      {vehicleLabel(v)}
                                    </button>
                                  ))
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {reviewingId === r.id ? (
                          <input
                            className="rounded border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="Comment (optional)"
                            value={reviewerComment}
                            onChange={(e) => setReviewerComment(e.target.value)}
                          />
                        ) : null}
                        <div className="flex gap-2">
                          {reviewingId === r.id ? (
                            <>
                              <button
                                onClick={() => reviewRequest(r.id, "accept", r.request_type)}
                                disabled={reviewBusy}
                                className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => reviewRequest(r.id, "reject", r.request_type)}
                                disabled={reviewBusy}
                                className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => {
                                  setReviewingId(null);
                                  setReviewError("");
                                  setReviewerComment("");
                                  setReplacementVehicleId("");
                                  setReplacementVehicleSearch("");
                                  setShowVehicleResults(false);
                                }}
                                className="rounded border border-zinc-300 px-3 py-1 text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { setReviewingId(r.id); setReviewError(""); }} className="rounded border border-zinc-300 px-3 py-1 text-xs">
                              Review
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
            {reviewError ? <p className="text-sm text-red-600">{reviewError}</p> : null}
          </div>
        </section>
      )}

      <section className="fts-panel p-6">
        <h2 className="text-lg font-semibold text-zinc-900">My transfer requests</h2>
        <div className="mt-4 space-y-2">
          {mine.length === 0 ? (
            <p className="text-sm text-zinc-500">No requests submitted yet.</p>
          ) : (
            mine.map((r) => (
              <div key={r.id} className="rounded border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                <p className="font-medium text-zinc-900">
                  {requestTypeLabel(r.request_type)} • {r.status}
                </p>
                <p>Reason: {r.request_reason}</p>
                {r.target_employee_id ? <p>Target: {employeeMap.get(r.target_employee_id) ?? "—"}</p> : null}
                {r.target_team_id ? <p>Team: {teamLookup.get(r.target_team_id) ?? "—"}</p> : null}
                {r.asset_id ? <p>Asset: {assetMap.get(r.asset_id) ?? "—"}</p> : null}
                {r.notes ? <p>Notes: {r.notes}</p> : null}
                {r.reviewer_comment ? <p>Reviewer comment: {r.reviewer_comment}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
