/**
 * Pull likely odometer / mileage integers from OCR text.
 * Prefers larger plausible km values (cars typically 0–999999).
 */
export function parseOdometerCandidates(ocrText: string): {
  best: number | null;
  candidates: number[];
} {
  const raw = (ocrText || "").replace(/,/g, "").replace(/\s+/g, " ");
  if (!raw) return { best: null, candidates: [] };

  const found = new Set<number>();

  // Explicit labels
  const labeled = [
    /(?:odo(?:meter)?|mileage|total|km|킬로)\s*[:\-]?\s*(\d{3,7})/gi,
    /(\d{3,7})\s*(?:km|kms|kilometers?)/gi,
  ];
  for (const re of labeled) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const n = Number.parseInt(m[1], 10);
      if (n >= 0 && n <= 9999999) found.add(n);
    }
  }

  // Standalone numbers (3–7 digits) — common dashboards
  for (const m of raw.matchAll(/\b(\d{3,7})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 100 && n <= 9999999) found.add(n);
  }

  const candidates = [...found].sort((a, b) => b - a);
  // Prefer mid-range car odometer if many small trip numbers exist
  const preferred =
    candidates.find((n) => n >= 1000 && n <= 999999) ??
    candidates[0] ??
    null;

  return { best: preferred, candidates: candidates.slice(0, 12) };
}
