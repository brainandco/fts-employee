import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getDataClient } from "@/lib/supabase/server";
import { runPool } from "@/lib/employee-files/concurrency-pool";
import { buildEmployeeRootPrefix, normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const PUT_CONCURRENCY = 12;
const MAX_PATHS = 40;

type Body = { regionId?: string; employeeId?: string; relativePath?: string; relativePaths?: string[] };

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const regionId = String(body.regionId ?? "").trim();
  const employeeId = String(body.employeeId ?? "").trim();
  if (!regionId || !employeeId) {
    return NextResponse.json({ message: "regionId and employeeId are required" }, { status: 400 });
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
    return NextResponse.json({ message: "relativePath or relativePaths[] is required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, region_id, status, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp || emp.status !== "ACTIVE") {
    return NextResponse.json({ message: "Employee not found or inactive" }, { status: 400 });
  }

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("path_segment")
    .eq("region_id", regionId)
    .maybeSingle();

  if (folderErr || !folder) {
    return NextResponse.json({ message: "Region folder not found." }, { status: 400 });
  }

  const root = buildEmployeeRootPrefix(folder.path_segment, emp.full_name ?? null, emp.id);
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
