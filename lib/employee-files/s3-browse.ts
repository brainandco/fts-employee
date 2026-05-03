import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";

export type BrowseEntry =
  | { type: "folder"; name: string; prefix: string }
  | { type: "file"; name: string; key: string; size: number | null; lastModified: string | null };

const LIST_PAGE_MAX_KEYS = 1000;

/** Flat list of object keys under prefix (no delimiter), paginated. */
export async function listAllObjectKeysUnderPrefix(
  s3: S3Client,
  bucket: string,
  prefix: string,
  maxKeys: number
): Promise<{ keys: string[]; truncated: boolean }> {
  const p = prefix.replace(/\/*$/, "/");
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: p,
        MaxKeys: LIST_PAGE_MAX_KEYS,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of list.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/.keep")) continue;
      keys.push(key);
      if (keys.length >= maxKeys) {
        return { keys, truncated: true };
      }
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return { keys, truncated: false };
}

export async function listRelativeFolderPathsBfs(
  s3: S3Client,
  bucket: string,
  absRootPrefix: string,
  maxFolders: number
): Promise<{ relativePaths: string[]; truncated: boolean }> {
  const root = absRootPrefix.replace(/\/*$/, "/");
  const seen = new Set<string>();
  const relativePaths: string[] = [];
  const queue: string[] = [root];
  let truncated = false;

  outer: while (queue.length > 0 && relativePaths.length < maxFolders) {
    const prefix = queue.shift()!;
    let continuationToken: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          Delimiter: "/",
          MaxKeys: LIST_PAGE_MAX_KEYS,
          ContinuationToken: continuationToken,
        })
      );
      for (const cp of list.CommonPrefixes ?? []) {
        const full = cp.Prefix ?? "";
        if (!full.startsWith(root)) continue;
        const rel = full.slice(root.length).replace(/\/+$/, "");
        if (!rel || seen.has(rel)) continue;
        seen.add(rel);
        relativePaths.push(rel);
        if (relativePaths.length >= maxFolders) {
          truncated = true;
          break outer;
        }
        queue.push(full);
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  return { relativePaths, truncated };
}

/** List immediate children under prefix (trailing slash normalized). Single S3 list call (one “directory” level). */
export async function browsePrefix(s3: S3Client, bucket: string, prefix: string): Promise<BrowseEntry[]> {
  const p = prefix === "" ? "" : prefix.replace(/\/*$/, "/");
  const out: BrowseEntry[] = [];
  const list = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: p,
      Delimiter: "/",
      MaxKeys: LIST_PAGE_MAX_KEYS,
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
