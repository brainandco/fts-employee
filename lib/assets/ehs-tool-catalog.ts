/** EHS safety tool types — unified EN codes and ID abbreviations. */

export type EhsWearRole = "dt" | "driver_rigger";

export type EhsToolTypeDef = {
  key: string;
  label: string;
  enCode: string;
  idAbbrev: string;
  idStart: number;
};

export const EHS_ID_PREFIX = "ASTEHS";

export const EHS_TOOL_TYPES: EhsToolTypeDef[] = [
  { key: "safety_shoe", label: "Safety Shoe", enCode: "EN 345 / 20345", idAbbrev: "SS", idStart: 1001 },
  { key: "safety_helmet", label: "Safety Helmet", enCode: "EN 397", idAbbrev: "SH", idStart: 2001 },
  { key: "safety_gloves", label: "Safety Gloves", enCode: "EN 420/407/388", idAbbrev: "SG", idStart: 3001 },
  { key: "safety_vest", label: "Safety Vest", enCode: "EN 471", idAbbrev: "SV", idStart: 4001 },
  { key: "first_aid_box", label: "First Aid Box", enCode: "N/A", idAbbrev: "FAB", idStart: 5001 },
  { key: "fire_extinguisher", label: "Fire Extinguisher", enCode: "N/A", idAbbrev: "FE", idStart: 6001 },
  { key: "double_lanyard", label: "Double Lanyard", enCode: "EN 355", idAbbrev: "DL", idStart: 7001 },
  { key: "full_body_harness", label: "Full Body Harness", enCode: "EN 813/358/361", idAbbrev: "FBH", idStart: 8001 },
  { key: "positioner_lanyard", label: "Positioner Lanyard", enCode: "EN 358", idAbbrev: "PL", idStart: 9001 },
  { key: "wire_fall_arrestor", label: "Wire Fall Arrestor WAH", enCode: "EN 353", idAbbrev: "WFA", idStart: 10001 },
  { key: "connector_karabiner", label: "Connector Twisted lock karabiner WAH", enCode: "EN 362", idAbbrev: "CK", idStart: 11001 },
  { key: "tool_box", label: "Tool Box", enCode: "N/A", idAbbrev: "TB", idStart: 12001 },
  { key: "rigger_tool_box", label: "Rigger Tool Box", enCode: "N/A", idAbbrev: "RTB", idStart: 13001 },
];

const byKey = new Map(EHS_TOOL_TYPES.map((t) => [t.key, t]));

export function getEhsToolType(key: string | null | undefined): EhsToolTypeDef | undefined {
  if (!key || typeof key !== "string") return undefined;
  return byKey.get(key.trim());
}
