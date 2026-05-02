import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { browsePrefix } from "@/lib/employee-files/s3-browse";
import { buildEmployeeRootPrefix, normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

type BrowseFileRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  upload_status: string;
  created_at: string;
  storage_key: string;
};

/** GET — list folders and files under the current employee’s storage path (any active employee with uploads enabled). */
export async function GET(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase
    .from("employees")
    .select("id, status, region_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!me || me.status !== "ACTIVE") {
    return NextResponse.json({ message: "No active employee profile" }, { status: 403 });
  }

  const fullName = me.full_name ?? null;

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("path_segment")
    .eq("region_id", me.region_id ?? "")
    .maybeSingle();

  if (folderErr || !folder || !me.region_id) {
    return NextResponse.json({ message: "Region folder is not configured." }, { status: 400 });
  }

  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path") ?? "";
  const normalized =
    rawPath.trim() === "" ? "" : normalizeRelativePathUnderEmployee(rawPath);
  if (rawPath.trim() !== "" && !normalized) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const root = buildEmployeeRootPrefix(folder.path_segment, fullName, me.id);
  const searchPrefix = normalized ? `${root}${normalized}/` : root;

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();
  let entries;
  try {
    entries = await browsePrefix(s3, bucket, searchPrefix);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const fileKeys = entries
    .filter((e): e is Extract<(typeof entries)[number], { type: "file" }> => e.type === "file")
    .map((e) => e.key);

  const rows: BrowseFileRow[] = [];
  const KEY_CHUNK = 80;
  for (let i = 0; i < fileKeys.length; i += KEY_CHUNK) {
    const slice = fileKeys.slice(i, i + KEY_CHUNK);
    const { data: chunk } = await supabase
      .from("employee_personal_files")
      .select("id, file_name, mime_type, byte_size, upload_status, created_at, storage_key")
      .eq("employee_id", me.id)
      .in("storage_key", slice);
    rows.push(...((chunk ?? []) as BrowseFileRow[]));
  }

  const byKey = new Map(rows.map((r) => [r.storage_key as string, r]));

  const folders = entries.filter((e) => e.type === "folder").map((e) => ({
    type: "folder" as const,
    name: e.name,
    path: normalized ? `${normalized}/${e.name}` : e.name,
  }));

  const files = entries
    .filter((e): e is Extract<(typeof entries)[number], { type: "file" }> => e.type === "file")
    .map((e) => {
      const row = byKey.get(e.key);
      return {
        type: "file" as const,
        name: e.name,
        key: e.key,
        size: e.size,
        lastModified: e.lastModified,
        db: row
          ? {
              id: row.id,
              file_name: row.file_name,
              mime_type: row.mime_type,
              byte_size: row.byte_size,
              upload_status: row.upload_status,
              created_at: row.created_at,
            }
          : null,
      };
    });

  return NextResponse.json({
    path: normalized,
    rootPrefix: root,
    folders,
    files,
  });
}
