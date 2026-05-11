import { getDataClient } from "@/lib/supabase/server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { multipartPartSignExpiresSec, s3PresignUploadPart } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

const MAX_PART_NUMBERS = 40;

type Body = {
  regionId?: string;
  employeeId?: string;
  id?: string;
  partNumbers?: number[];
};

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
  const id = String(body.id ?? "").trim();
  if (!regionId || !employeeId || !id) {
    return NextResponse.json({ message: "regionId, employeeId, and id are required" }, { status: 400 });
  }

  const rawParts = Array.isArray(body.partNumbers) ? body.partNumbers : [];
  const partNumbers = rawParts
    .map((n) => (typeof n === "number" && Number.isInteger(n) ? n : null))
    .filter((n): n is number => n != null && n >= 1 && n <= 10_000);
  if (partNumbers.length === 0) {
    return NextResponse.json({ message: "partNumbers is required" }, { status: 400 });
  }
  if (partNumbers.length > MAX_PART_NUMBERS) {
    return NextResponse.json({ message: `At most ${MAX_PART_NUMBERS} parts per request` }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: row, error: rowErr } = await supabase
    .from("employee_personal_files")
    .select("id, employee_id, region_id, storage_key, upload_status, multipart_upload_id")
    .eq("id", id)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }
  if (row.employee_id !== employeeId || row.region_id !== regionId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (row.upload_status !== "pending" || !row.multipart_upload_id) {
    return NextResponse.json({ message: "Not an in-progress multipart upload" }, { status: 400 });
  }

  const uploadId = row.multipart_upload_id as string;
  const storageKey = row.storage_key as string;

  try {
    const s3 = getWasabiEmployeeFilesS3Client();
    const bucket = getWasabiEmployeeFilesBucket();
    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        uploadUrl: await s3PresignUploadPart(s3, bucket, storageKey, uploadId, partNumber),
      }))
    );
    return NextResponse.json({ parts, expiresIn: multipartPartSignExpiresSec() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Presign failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
