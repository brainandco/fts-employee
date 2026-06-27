export type TransferAccess = {
  canRequestAssetTransfer: boolean;
  canRequestVehicleFlows: boolean;
  canRequest: boolean;
  canReview: boolean;
  isPm: boolean;
  isSelfDt: boolean;
};

export function computeTransferAccess(roleSet: Set<string>): TransferAccess {
  const isSelfDt = roleSet.has("Self DT");
  const canRequestAssetTransfer =
    roleSet.has("DT") ||
    roleSet.has("Junior DT") ||
    roleSet.has("PP") ||
    roleSet.has("Reporting Team") ||
    isSelfDt;
  const canRequestVehicleFlows = roleSet.has("Driver/Rigger") || isSelfDt;
  const canRequest = canRequestAssetTransfer || canRequestVehicleFlows;
  const canReview = roleSet.has("QC") || roleSet.has("Project Manager");
  const isPm = roleSet.has("Project Manager");
  return {
    canRequestAssetTransfer,
    canRequestVehicleFlows,
    canRequest,
    canReview,
    isPm,
    isSelfDt,
  };
}
