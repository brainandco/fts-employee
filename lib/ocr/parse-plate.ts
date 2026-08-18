/** Saudi plate Latin letters (official mapping). */
const KSA_LATIN = new Set("ABDEGHJKLMNRSTUVXZ".split(""));

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

/** Arabic letter → KSA plate Latin (ح=J, ط=T, etc.). */
const ARABIC_LETTER: Record<string, string> = {
  ا: "A",
  أ: "A",
  إ: "A",
  آ: "A",
  ب: "B",
  ح: "J",
  د: "D",
  ر: "R",
  س: "S",
  ص: "X",
  ط: "T",
  ع: "E",
  ق: "G",
  ك: "K",
  ل: "L",
  م: "M",
  ن: "N",
  ه: "H",
  و: "U",
  ى: "V",
  ي: "V",
};

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ").replace(/storage\/v1\/\S+/gi, " ");
}

function toLatinPlateChars(text: string): string {
  let out = "";
  for (const ch of stripUrls(text)) {
    if (ARABIC_DIGIT[ch]) out += ARABIC_DIGIT[ch];
    else if (ARABIC_LETTER[ch]) out += ARABIC_LETTER[ch];
    else out += ch;
  }
  return out.toUpperCase();
}

function isUuidHexNoise(s: string): boolean {
  const compact = s.replace(/[^A-Z0-9]/g, "");
  if (compact.length < 12) return false;
  // UUIDs / storage object ids are long hex (0-9A-F only)
  return /^[0-9A-F]+$/.test(compact) && compact.length >= 12;
}

function normalizePlateToken(s: string): string {
  return s.replace(/[^A-Z0-9]/g, "");
}

/** Canonical KSA display: 4 digits + space + 3 letters, e.g. 7653 TNJ */
export function formatKsaPlate(digits: string, letters: string): string {
  return `${digits} ${letters}`;
}

function scoreKsaPlate(compact: string): number | null {
  // 4 digits + 1–3 letters (KSA private plates are typically 4+3)
  const m = compact.match(/^(\d{3,4})([A-Z]{2,3})$/) || compact.match(/^([A-Z]{2,3})(\d{3,4})$/);
  if (!m) return null;
  const letters = /\d/.test(m[1]) ? m[2] : m[1];
  const digits = /\d/.test(m[1]) ? m[1] : m[2];
  if (letters.split("").some((c) => !KSA_LATIN.has(c))) return 5;
  if (digits.length === 4 && letters.length === 3) return 100;
  if (digits.length === 4 && letters.length === 2) return 70;
  return 40;
}

function formatFromCompact(compact: string): string {
  const a = compact.match(/^(\d{3,4})([A-Z]{2,3})$/);
  if (a) return formatKsaPlate(a[1], a[2]);
  const b = compact.match(/^([A-Z]{2,3})(\d{3,4})$/);
  if (b) return formatKsaPlate(b[2], b[1]);
  return compact;
}

/**
 * Extract Saudi / GCC plate from OCR. Ignores UUID/hex noise from storage URLs.
 */
export function parsePlateCandidates(
  ocrText: string,
  assignedPlate?: string | null
): { best: string | null; candidates: string[] } {
  const latin = toLatinPlateChars(ocrText || "");
  if (!latin.trim()) {
    const assigned = assignedPlate?.trim();
    return { best: assigned || null, candidates: assigned ? [assigned] : [] };
  }

  const compactAll = latin.replace(/[^A-Z0-9]/g, "");
  const scored = new Map<string, number>();

  const consider = (token: string, bonus = 0) => {
    const compact = normalizePlateToken(token);
    if (compact.length < 5 || compact.length > 8) return;
    if (isUuidHexNoise(compact)) return;
    if (!/\d/.test(compact) || !/[A-Z]/.test(compact)) return;
    const ksa = scoreKsaPlate(compact);
    if (ksa == null) return;
    const formatted = formatFromCompact(compact);
    scored.set(formatted, Math.max(scored.get(formatted) ?? 0, ksa + bonus));

    // Arabic OCR often returns the 3 letters RTL (JNT vs TNJ)
    const rev = compact.match(/^(\d{3,4})([A-Z]{3})$/);
    if (rev) {
      const reversed = rev[1] + [...rev[2]].reverse().join("");
      const ksaRev = scoreKsaPlate(reversed);
      if (ksaRev != null) {
        const formattedRev = formatFromCompact(reversed);
        scored.set(formattedRev, Math.max(scored.get(formattedRev) ?? 0, ksaRev + bonus - 8));
      }
    }
  };

  // Sliding window over compact OCR (handles "KSA7653TNJ" / "٧٦٥٣TNJ")
  for (let len = 5; len <= 7; len++) {
    for (let i = 0; i + len <= compactAll.length; i++) {
      consider(compactAll.slice(i, i + len));
    }
  }

  for (const m of latin.matchAll(/\b(\d{3,4})\s*([A-Z]{2,3})\b/g)) {
    consider(m[1] + m[2], 20);
  }
  for (const m of latin.matchAll(/\b([A-Z]{2,3})\s*(\d{3,4})\b/g)) {
    consider(m[2] + m[1], 20);
  }

  // Prefer Latin letter block printed on KSA plates (TNJ), not Arabic RTL order (JNT)
  const ascii = stripUrls(ocrText || "").toUpperCase();
  const latinTriples = [...ascii.matchAll(/[A-Z]{3}/g)]
    .map((m) => m[0])
    .filter((t) => t !== "KSA" && [...t].every((c) => KSA_LATIN.has(c)));
  const digitGroups = [...latin.matchAll(/\d{4}/g)].map((m) => m[0]);
  for (const digits of digitGroups) {
    for (const letters of latinTriples) {
      consider(digits + letters, 45);
    }
  }

  const assignedCompact = assignedPlate ? normalizePlateToken(toLatinPlateChars(assignedPlate)) : "";
  if (assignedCompact && compactAll.includes(assignedCompact)) {
    consider(assignedCompact, 50);
  }

  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1]);
  const candidates = ranked.map(([p]) => p).slice(0, 8);
  const best = candidates[0] ?? (assignedPlate?.trim() || null);
  return { best, candidates };
}
