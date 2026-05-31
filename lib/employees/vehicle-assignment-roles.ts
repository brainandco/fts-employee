/** Roles that may receive a vehicle assignment (PM, Admin, region pools). */
export const VEHICLE_ASSIGNEE_ROLES = ["Driver/Rigger", "Self DT", "QA"] as const;

export type VehicleAssigneeRole = (typeof VEHICLE_ASSIGNEE_ROLES)[number];

export function isVehicleAssigneeRole(role: string): boolean {
  return (VEHICLE_ASSIGNEE_ROLES as readonly string[]).includes(role);
}

export const VEHICLE_ASSIGNEE_ROLES_LABEL =
  "Driver/Rigger, Self DT, or QA";
