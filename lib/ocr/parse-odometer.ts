const SPEEDO_TICKS = new Set([20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260]);

/** Max km added in one duty — filters glued OCR noise (e.g. trip digit + total). */
const MAX_SHIFT_KM = 800;

const ARABIC_DIGIT: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

function normalizeDigits(text: string): string {
  return [...text]
    .map((ch) => ARABIC_DIGIT[ch] ?? ch)
    .join("")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}

function isPlausibleOdometer(n: number): boolean {
  return n >= 1000 && n <= 9999999 && !SPEEDO_TICKS.has(n);
}

/** OCR often glues trip-meter or stray digits onto total km (e.g. 1 + 160648 → 1160648). */
function expandGluedValues(n: number): number[] {
  const s = String(n);
  const out = new Set<number>();
  if (isPlausibleOdometer(n)) out.add(n);
  for (let strip = 1; strip <= 3 && strip < s.length - 3; strip++) {
    const sub = Number.parseInt(s.slice(strip), 10);
    if (isPlausibleOdometer(sub)) out.add(sub);
  }
  return [...out];
}

function pickBestWithAnchor(candidates: number[], anchor: number): number | null {
  const minKm = Math.floor(anchor * 0.995);
  const maxKm = anchor + MAX_SHIFT_KM;
  const plausible = candidates.filter((n) => n >= minKm && n <= maxKm);
  if (plausible.length === 0) return null;
  return plausible.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0] ?? null;
}

function pickBestWithoutAnchor(candidates: number[]): number | null {
  const totals = candidates.filter((n) => n >= 10000 && n <= 999999);
  const pool = totals.length ? totals : candidates.filter((n) => n >= 1000 && n <= 999999);
  if (!pool.length) return candidates[0] ?? null;
  // Prefer typical 5–6 digit totals; avoid always taking the largest (often glued noise).
  return pool.sort((a, b) => a - b)[Math.floor(pool.length / 2)] ?? pool[0] ?? null;
}

/**
 * Main odometer (total km), not trip meter or speedometer ticks.
 * @param anchorKm — vehicle mileage or duty start km; end-of-duty should pass start km.
 */
export function parseOdometerCandidates(
  ocrText: string,
  anchorKm?: number | null
): {
  best: number | null;
  candidates: number[];
} {
  const raw = normalizeDigits(ocrText || "");
  if (!raw) return { best: null, candidates: [] };

  const found = new Set<number>();

  const labeled = [
    /(?:odo(?:meter)?|mileage|total|km)\s*[:\-]?\s*(\d{4,7})/gi,
    /(\d{4,7})\s*(?:km|kms|kilometers?)/gi,
  ];
  for (const re of labeled) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      const n = Number.parseInt(m[1], 10);
      for (const v of expandGluedValues(n)) found.add(v);
    }
  }

  for (const m of raw.matchAll(/\b(\d{4,7})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    for (const v of expandGluedValues(n)) found.add(v);
  }

  const candidates = [...found].sort((a, b) => a - b);
  if (candidates.length === 0) return { best: null, candidates: [] };

  const anchor = typeof anchorKm === "number" && anchorKm > 0 ? anchorKm : null;
  const best =
    anchor != null
      ? (pickBestWithAnchor(candidates, anchor) ?? pickBestWithoutAnchor(candidates))
      : pickBestWithoutAnchor(candidates);

  return { best, candidates: candidates.slice(0, 12) };
}
