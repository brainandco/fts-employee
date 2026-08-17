/** Default hard cap ≈ $13/mo Vision OCR (1k free + 8666 × $1.50/1k). */
export const DEFAULT_OCR_MONTHLY_UNIT_CAP = 9666;

export function ocrMonthlyUnitCap(): number {
  const raw = process.env.OCR_MONTHLY_UNIT_CAP?.trim();
  if (!raw) return DEFAULT_OCR_MONTHLY_UNIT_CAP;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_OCR_MONTHLY_UNIT_CAP;
}

export function currentYearMonthUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
