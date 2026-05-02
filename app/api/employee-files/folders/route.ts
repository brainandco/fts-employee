import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { runPool } from "@/lib/employee-files/concurrency-pool";
import { buildEmployeeRootPrefix, normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const PUT_CONCURRENCY = 12;
const MAX_PATHS = 40;

type Body = { relativePath?: string; relativePaths?: string[] };

/** POST — create empty folder marker(s) under the employee tree (.keep). Supports batch via `relativePaths`. */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const paths: string[] = [];
  if (Array.isArray(body.relativePaths) && body.relativePaths.length > 0) {
    for (const p of body.relativePaths.slice(0, MAX_PATHS)) {
      const n = normalizeRelativePathUnderEmployee(String(p ?? ""));
      if (n) paths.push(n);
    }
  } else {
    const one = normalizeRelativePathUnderEmployee(String(body.relativePath ?? ""));
    if (one) paths.push(one);
  }

  const unique = [...new Set(paths)];
  if (unique.length === 0) {
    return NextResponse.json(
      { message: "relativePath or relativePaths[] is required (e.g. Apr-2026/28-Apr-2026/MyFolder)" },
      { status: 400 }
    );
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase
    .from("employees")
    .select("id, status, region_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!me || me.status !== "ACTIVE" || !me.region_id) {
    return NextResponse.json({ message: "No active employee profile or region" }, { status: 403 });
  }

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("path_segment")
    .eq("region_id", me.region_id)
    .maybeSingle();

  if (folderErr || !folder) {
    return NextResponse.json({ message: "Region folder is not configured." }, { status: 400 });
  }

  const root = buildEmployeeRootPrefix(folder.path_segment, me.full_name ?? null, me.id);
  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();

  try {
    await runPool(unique, PUT_CONCURRENCY, async (rel) => {
      const markerKey = `${root}${rel}/.keep`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: markerKey,
          Body: "",
        })
      );
      return null;
    });
    return NextResponse.json({ ok: true, created: unique.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create folder failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
