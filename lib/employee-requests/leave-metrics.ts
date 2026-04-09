function parseLocalDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, da] = iso.split("-").map(Number);
  return new Date(y, mo - 1, da);
}

/** Inclusive calendar days from fromIso through toIso (same day = 1). */
export function inclusiveCalendarDays(fromIso: string, toIso: string): number {
  const a = parseLocalDate(fromIso);
  const b = parseLocalDate(toIso);
  if (!a || !b || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}
