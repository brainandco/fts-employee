/**
 * Find relative paths (under employee root) where a path segment matches a site / folder query.
 * Same behavior as admin employee-files site search.
 */
export function matchSiteFolderPaths(
  relativeObjectKeys: string[],
  queryRaw: string
): Map<string, { siteSegment: string; folderPath: string }> {
  const query = queryRaw.trim();
  if (!query) return new Map();
  const qLower = query.toLowerCase();
  const out = new Map<string, { siteSegment: string; folderPath: string }>();

  for (const rel of relativeObjectKeys) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let matchIdx = -1;
    let matchedSeg = "";

    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]!;
      const noExt = seg.includes(".") ? seg.slice(0, seg.lastIndexOf(".")) : seg;
      if (seg.toLowerCase() === qLower || noExt.toLowerCase() === qLower) {
        matchIdx = i;
        matchedSeg = seg;
        break;
      }
    }

    if (matchIdx < 0 && query.length >= 3) {
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i]!;
        if (seg.includes(".")) continue;
        if (seg.toLowerCase().includes(qLower)) {
          matchIdx = i;
          matchedSeg = seg;
          break;
        }
      }
    }

    if (matchIdx < 0) continue;

    const folderPath = parts.slice(0, matchIdx + 1).join("/");
    if (!out.has(folderPath)) {
      out.set(folderPath, { siteSegment: matchedSeg, folderPath });
    }
  }

  return out;
}

export function stripEmployeeRootFromKey(fullKey: string, employeeRootPrefix: string): string | null {
  const r = employeeRootPrefix.replace(/\/*$/, "/");
  if (!fullKey.startsWith(r)) return null;
  return fullKey.slice(r.length);
}
