const SPEEDO_TICKS = new Set([20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260]);

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

/**
 * Main odometer (total km), not trip meter or speedometer ticks.
 */
export function parseOdometerCandidates(
  ocrText: string,
  previousKm?: number | null
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
      if (n >= 1000 && n <= 9999999 && !SPEEDO_TICKS.has(n)) found.add(n);
    }
  }

  for (const m of raw.matchAll(/\b(\d{4,7})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1000 && n <= 9999999 && !SPEEDO_TICKS.has(n)) found.add(n);
  }

  const candidates = [...found].sort((a, b) => b - a);
  if (candidates.length === 0) return { best: null, candidates: [] };

  const prev = typeof previousKm === "number" && previousKm > 0 ? previousKm : null;
  if (prev != null) {
    const notBelow = candidates.filter((n) => n >= prev * 0.98 && n <= prev + 2000);
    const closest = notBelow.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0];
    if (closest != null) return { best: closest, candidates: candidates.slice(0, 12) };
  }

  // Prefer 5–6 digit total km (e.g. 144969) over 4-digit trip (6381)
  const six = candidates.filter((n) => n >= 10000 && n <= 999999);
  const preferred = six[0] ?? candidates.find((n) => n >= 1000 && n <= 999999) ?? candidates[0] ?? null;

  return { best: preferred, candidates: candidates.slice(0, 12) };
}
