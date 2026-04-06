"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReturnHandInPhotos } from "@/components/assets/ReturnHandInPhotos";
import { MIN_RESOURCE_PHOTOS } from "@/lib/resource-photos";

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
  handover_image_urls?: string[] | null;
};

type EmployeeOption = { id: string; full_name: string };
type AssetOption = { id: string; name: string; serial: string | null };
type VehicleOption = { id: string; plate_number: string; make: string | null; model: string | null };

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
  vehicleSwapDrivers,
  assetTransferDts,
  driveSwapDrivers,
  teamLabels,
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
  vehicleSwapDrivers: EmployeeOption[];
  assetTransferDts: EmployeeOption[];
  driveSwapDrivers: EmployeeOption[];
  teamLabels: Record<string, string>;
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
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [handoverUrls, setHandoverUrls] = useState<string[]>([]);

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
    for (const [id, label] of Object.entries(teamLabels)) m.set(id, label);
    return m;
  }, [teamLabels]);
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

  useEffect(() => {
    if (!allowedRequestTypes.includes(requestType)) {
      setRequestType(allowedRequestTypes[0] ?? "asset_transfer");
    }
  }, [allowedRequestTypes, requestType]);

  useEffect(() => {
    setTargetEmployeeId("");
    setAssetId("");
    setHandoverUrls([]);
  }, [requestType]);

  useEffect(() => {
    setHandoverUrls([]);
  }, [assetId]);

  const incoming = useMemo(
    () => requests.filter((r) => r.requester_employee_id !== meId),
    [requests, meId]
  );
  const mine = useMemo(
    () => requests.filter((r) => r.requester_employee_id === meId),
    [requests, meId]
  );

  const driverOptions =
    requestType === "drive_swap" ? driveSwapDrivers : vehicleSwapDrivers;

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!reason.trim()) return setFormError("Reason is required.");
    if (requestType === "vehicle_swap") {
      if (!targetEmployeeId) return setFormError("Choose the driver to swap with.");
    }
    if (requestType === "drive_swap") {
      if (!targetEmployeeId) return setFormError("Choose the driver to swap teams with.");
    }
    if (requestType === "asset_transfer") {
      if (!targetEmployeeId) return setFormError("Choose the DT receiving the asset.");
      if (!assetId) return setFormError("Select an asset.");
      if (handoverUrls.length < MIN_RESOURCE_PHOTOS) {
        return setFormError(`Add at least ${MIN_RESOURCE_PHOTOS} photos of the asset’s condition before submitting.`);
      }
    }
    setSubmitting(true);

    const res = await fetch("/api/transfer-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: requestType,
        target_employee_id: targetEmployeeId || undefined,
        asset_id: assetId || undefined,
        request_reason: reason.trim(),
        notes: notes.trim() || undefined,
        ...(requestType === "asset_transfer" ? { handover_image_urls: handoverUrls } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return setFormError(data.message || "Failed to submit request.");
    setReason("");
    setNotes("");
    setTargetEmployeeId("");
    setAssetId("");
    setHandoverUrls([]);
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
            Select the other person directly (driver or DT). No team step—only eligible colleagues in your region appear.
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
              <label className="text-sm text-zinc-700 md:col-span-2">
                Driver (swap with)
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                >
                  <option value="">Select driver</option>
                  {vehicleSwapDrivers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                {vehicleSwapDrivers.length === 0 ? (
                  <p className="mt-1 text-sm text-amber-700">No other drivers available in your region for swap.</p>
                ) : null}
              </label>
            )}

            {requestType === "asset_transfer" && (
              <>
                <label className="text-sm text-zinc-700 md:col-span-2">
                  DT receiving the asset
                  <select
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                    value={targetEmployeeId}
                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                  >
                    <option value="">Select DT</option>
                    {assetTransferDts.map((m) => (
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
                {assetId ? (
                  <div className="md:col-span-2">
                    <ReturnHandInPhotos
                      purpose="asset-transfer-handover"
                      assetId={assetId}
                      urls={handoverUrls}
                      onUrlsChange={setHandoverUrls}
                      title="Handover condition photos"
                    />
                  </div>
                ) : null}
                {assetTransferDts.length === 0 ? (
                  <p className="text-sm text-amber-700 md:col-span-2">No other DTs available for transfer in your region.</p>
                ) : null}
              </>
            )}

            {requestType === "drive_swap" && (
              <label className="text-sm text-zinc-700 md:col-span-2">
                Other driver (swap team assignments with)
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2"
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                >
                  <option value="">Select driver</option>
                  {driveSwapDrivers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                {driveSwapDrivers.length === 0 ? (
                  <p className="mt-1 text-sm text-amber-700">No other drivers available for drive swap.</p>
                ) : null}
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
                      {r.request_type === "asset_transfer" &&
                      Array.isArray(r.handover_image_urls) &&
                      r.handover_image_urls.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-zinc-600">Handover photos</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {r.handover_image_urls.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block h-16 w-16 overflow-hidden rounded border border-zinc-200 bg-white"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
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
                {r.request_type === "asset_transfer" &&
                Array.isArray(r.handover_image_urls) &&
                r.handover_image_urls.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-zinc-600">Your handover photos</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {r.handover_image_urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block h-14 w-14 overflow-hidden rounded border border-zinc-200 bg-white"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
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
