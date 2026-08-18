/** Split a KSA plate into letters + digits for side-by-side inputs (TSR | 2345). */
export function splitPlateParts(plate: string | null | undefined): { letters: string; digits: string } {
  const raw = (plate ?? "").toUpperCase().trim();
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  const paired =
    compact.match(/^(\d{3,4})([A-Z]{1,4})$/) || compact.match(/^([A-Z]{1,4})(\d{3,4})$/);
  if (paired) {
    const a = paired[1];
    const b = paired[2];
    if (/\d/.test(a)) return { digits: a, letters: b };
    return { letters: a, digits: b };
  }
  return {
    letters: raw.replace(/[^A-Z]/g, ""),
    digits: raw.replace(/[^0-9]/g, ""),
  };
}

/** Save format: digits then letters, e.g. 2345 TSR */
export function joinPlateParts(letters: string, digits: string): string {
  const L = letters.toUpperCase().replace(/[^A-Z]/g, "");
  const D = digits.replace(/[^0-9]/g, "");
  if (D && L) return `${D} ${L}`;
  return `${D}${L}`.trim();
}

export function todayLocalIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
