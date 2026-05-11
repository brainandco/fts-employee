import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { multipartPartSignExpiresSec, s3PresignUploadPart } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

const MAX_PART_NUMBERS = 40;

type Body = {
  id?: string;
  partNumbers?: number[];
};

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

  const id = String(body.id ?? "").trim();
  const rawParts = Array.isArray(body.partNumbers) ? body.partNumbers : [];
  const partNumbers = rawParts
    .map((n) => (typeof n === "number" && Number.isInteger(n) ? n : null))
    .filter((n): n is number => n != null && n >= 1 && n <= 10_000);

  if (!id || partNumbers.length === 0) {
    return NextResponse.json({ message: "id and partNumbers are required" }, { status: 400 });
  }
  if (partNumbers.length > MAX_PART_NUMBERS) {
    return NextResponse.json({ message: `At most ${MAX_PART_NUMBERS} parts per request` }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!me) {
    return NextResponse.json({ message: "No employee profile" }, { status: 403 });
  }

  const { data: row, error: rowErr } = await supabase
    .from("employee_personal_files")
    .select("id, employee_id, storage_key, upload_status, multipart_upload_id")
    .eq("id", id)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }
  if (row.employee_id !== me.id) {
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
