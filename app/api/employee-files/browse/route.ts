import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { resolveEmployeeFileAccess } from "@/lib/employee-files/access";
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

/** GET — list folders and files under the current employee’s storage path (PM / PP / Team Lead only). */
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
  const { employee: me, canView } = await resolveEmployeeFileAccess(supabase, email);
  if (!me) {
    return NextResponse.json({ message: "No active employee profile" }, { status: 403 });
  }
  if (!canView) {
    return NextResponse.json({ message: "Browse is available for Project Managers, PP, and Team Lead only." }, { status: 403 });
  }

  const { data: empRow } = await supabase.from("employees").select("full_name").eq("id", me.id).maybeSingle();
  const fullName = empRow?.full_name ?? null;

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

  const { data: rows } = await supabase
    .from("employee_personal_files")
    .select("id, file_name, mime_type, byte_size, upload_status, created_at, storage_key")
    .eq("employee_id", me.id);

  const byKey = new Map((rows ?? []).map((r) => [r.storage_key as string, r as BrowseFileRow]));

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
