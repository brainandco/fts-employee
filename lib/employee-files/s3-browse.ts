import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";

export type BrowseEntry =
  | { type: "folder"; name: string; prefix: string }
  | { type: "file"; name: string; key: string; size: number | null; lastModified: string | null };

/** List immediate children under prefix (trailing slash normalized). */
export async function browsePrefix(s3: S3Client, bucket: string, prefix: string): Promise<BrowseEntry[]> {
  const p = prefix.replace(/\/*$/, "/");
  const out: BrowseEntry[] = [];
  const list = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: p,
      Delimiter: "/",
    })
  );
  for (const cp of list.CommonPrefixes ?? []) {
    const full = cp.Prefix ?? "";
    const name = full.slice(p.length).replace(/\/$/, "");
    if (name) out.push({ type: "folder", name, prefix: full });
  }
  for (const obj of list.Contents ?? []) {
    const key = obj.Key;
    if (!key || key.endsWith("/") || key.endsWith("/.keep")) continue;
    const name = key.slice(p.length);
    if (!name || name.includes("/")) continue;
    out.push({
      type: "file",
      name,
      key,
      size: obj.Size ?? null,
      lastModified: obj.LastModified?.toISOString() ?? null,
    });
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
