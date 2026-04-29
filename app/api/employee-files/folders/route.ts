import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { buildEmployeeRootPrefix, normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

type Body = { relativePath?: string };

/** POST — create an empty folder marker under the employee tree (all employees who can upload). */
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

  const relativePath = normalizeRelativePathUnderEmployee(String(body.relativePath ?? ""));
  if (!relativePath) {
    return NextResponse.json({ message: "relativePath is required (e.g. Apr-2026/28-Apr-2026/MyFolder)" }, { status: 400 });
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
  const markerKey = `${root}${relativePath}/.keep`;

  try {
    const s3 = getWasabiEmployeeFilesS3Client();
    const bucket = getWasabiEmployeeFilesBucket();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: markerKey,
        Body: "",
      })
    );
    return NextResponse.json({ ok: true, markerKey });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create folder failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
