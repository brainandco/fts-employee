import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { s3AbortMultipartUpload, s3CompleteMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

type PartIn = { PartNumber?: number; ETag?: string };

type Body = {
  id?: string;
  parts?: PartIn[];
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
  const rawParts = Array.isArray(body.parts) ? body.parts : [];
  if (!id || rawParts.length === 0) {
    return NextResponse.json({ message: "id and parts are required" }, { status: 400 });
  }

  const parts: { PartNumber: number; ETag: string }[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i]!;
    const pn = typeof p.PartNumber === "number" && Number.isInteger(p.PartNumber) ? p.PartNumber : null;
    const etag = typeof p.ETag === "string" ? p.ETag.trim() : "";
    if (pn == null || pn < 1 || !etag) {
      return NextResponse.json({ message: `Invalid part at index ${i}` }, { status: 400 });
    }
    parts.push({ PartNumber: pn, ETag: etag });
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
  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();

  try {
    await s3CompleteMultipartUpload(s3, bucket, storageKey, uploadId, parts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Complete failed";
    try {
      await s3AbortMultipartUpload(s3, bucket, storageKey, uploadId);
    } catch {
      /* ignore */
    }
    await supabase
      .from("employee_personal_files")
      .update({ upload_status: "failed", multipart_upload_id: null })
      .eq("id", id);
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  let byte_size: number | null = null;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
    byte_size = typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch {
    await supabase
      .from("employee_personal_files")
      .update({ upload_status: "failed", multipart_upload_id: null })
      .eq("id", id);
    return NextResponse.json({ message: "Uploaded object not found after complete" }, { status: 500 });
  }

  await supabase
    .from("employee_personal_files")
    .update({ upload_status: "active", byte_size, multipart_upload_id: null })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
