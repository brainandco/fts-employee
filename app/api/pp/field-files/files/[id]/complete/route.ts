import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getDataClient } from "@/lib/supabase/server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: row, error: fetchErr } = await supabase
    .from("employee_personal_files")
    .select("id, storage_key, upload_status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }
  if (row.upload_status !== "pending") {
    return NextResponse.json({ message: "Already completed" }, { status: 400 });
  }

  const bucket = getWasabiEmployeeFilesBucket();
  const s3 = getWasabiEmployeeFilesS3Client();
  let size: number | null = null;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.storage_key }));
    size = typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch {
    await supabase.from("employee_personal_files").update({ upload_status: "failed" }).eq("id", id);
    return NextResponse.json({ message: "Object not found in storage" }, { status: 400 });
  }

  const { error: upd } = await supabase
    .from("employee_personal_files")
    .update({ upload_status: "active", byte_size: size })
    .eq("id", id);
  if (upd) {
    return NextResponse.json({ message: upd.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, byte_size: size });
}
