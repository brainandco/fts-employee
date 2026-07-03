/** EHS safety tool types — unified EN codes, wear roles, and ID abbreviations. */

export type EhsWearRole = "dt" | "driver_rigger";

export type EhsToolTypeDef = {
  key: string;
  label: string;
  enCode: string;
  idAbbrev: string;
  wearRoles: EhsWearRole[];
  idStart: number;
};

export const EHS_ID_PREFIX = "ASTEHS";

export const EHS_TOOL_TYPES: EhsToolTypeDef[] = [
  { key: "safety_shoe", label: "Safety Shoe", enCode: "EN 345 / 20345", idAbbrev: "SS", wearRoles: ["dt", "driver_rigger"], idStart: 15001 },
  { key: "safety_helmet", label: "Safety Helmet", enCode: "EN 397", idAbbrev: "SH", wearRoles: ["dt", "driver_rigger"], idStart: 15001 },
  { key: "safety_gloves", label: "Safety Gloves", enCode: "EN 420/407/388", idAbbrev: "SG", wearRoles: ["dt", "driver_rigger"], idStart: 15001 },
  { key: "safety_vest", label: "Safety Vest", enCode: "EN 471", idAbbrev: "SV", wearRoles: ["dt", "driver_rigger"], idStart: 15001 },
  { key: "first_aid_box", label: "First Aid Box", enCode: "N/A", idAbbrev: "FAB", wearRoles: ["dt"], idStart: 15001 },
  { key: "fire_extinguisher", label: "Fire Extinguisher", enCode: "N/A", idAbbrev: "FE", wearRoles: ["dt"], idStart: 15001 },
  { key: "double_lanyard", label: "Double Lanyard", enCode: "EN 355", idAbbrev: "DL", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "full_body_harness", label: "Full Body Harness", enCode: "EN 813/358/361", idAbbrev: "FBH", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "positioner_lanyard", label: "Positioner Lanyard", enCode: "EN 358", idAbbrev: "PL", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "wire_fall_arrestor", label: "Wire Fall Arrestor WAH", enCode: "EN 353", idAbbrev: "WFA", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "connector_karabiner", label: "Connector Twisted lock karabiner WAH", enCode: "EN 362", idAbbrev: "CK", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "tool_box", label: "Tool Box", enCode: "N/A", idAbbrev: "TB", wearRoles: ["driver_rigger"], idStart: 15001 },
  { key: "rigger_tool_box", label: "Rigger Tool Box", enCode: "N/A", idAbbrev: "RTB", wearRoles: ["driver_rigger"], idStart: 15001 },
];

const byKey = new Map(EHS_TOOL_TYPES.map((t) => [t.key, t]));

export function getEhsToolType(key: string): EhsToolTypeDef | undefined {
  return byKey.get(key.trim());
}
