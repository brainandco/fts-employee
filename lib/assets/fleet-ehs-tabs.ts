export type FleetEhsTab = "fleet" | "ehs";

export function parseFleetEhsTab(raw: string | undefined): FleetEhsTab {
  return raw === "ehs" ? "ehs" : "fleet";
}
