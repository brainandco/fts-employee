/**
 * Heuristic plate extraction from OCR text (Saudi / GCC style plates vary).
 */
export function parsePlateCandidates(ocrText: string): { best: string | null; candidates: string[] } {
  const raw = (ocrText || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!raw) return { best: null, candidates: [] };

  const candidates = new Set<string>();

  // Alphanumeric sequences that look like plates (letters + digits mixed)
  const patterns = [
    /\b([A-Z]{1,3}[\s-]?\d{1,4}[\s-]?[A-Z]{0,3})\b/g,
    /\b(\d{1,4}[\s-]?[A-Z]{1,3}[\s-]?\d{0,4})\b/g,
    /\b([A-Z0-9]{2,}[\s-]?[A-Z0-9]{2,})\b/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(raw)) !== null) {
      const cleaned = m[1].replace(/\s+/g, " ").trim();
      if (cleaned.length >= 3 && cleaned.length <= 16 && /\d/.test(cleaned) && /[A-Z]/.test(cleaned)) {
        candidates.add(cleaned);
      }
    }
  }

  // Also whole-line compact tokens
  for (const line of raw.split(/\n+/)) {
    const compact = line.replace(/[^A-Z0-9]/g, "");
    if (compact.length >= 4 && compact.length <= 12 && /\d/.test(compact) && /[A-Z]/.test(compact)) {
      candidates.add(compact.replace(/(.{3})/g, "$1 ").trim());
      candidates.add(compact);
    }
  }

  const list = [...candidates].sort((a, b) => b.length - a.length);
  return { best: list[0] ?? null, candidates: list.slice(0, 8) };
}
