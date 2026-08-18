export type DutySlot = "start" | "end";

/** Accept start/end plus legacy morning/evening from older apps. */
export function normalizeDutySlot(raw: unknown): DutySlot | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "start" || s === "morning") return "start";
  if (s === "end" || s === "evening") return "end";
  return null;
}

export function riyadhIsoDate(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}
