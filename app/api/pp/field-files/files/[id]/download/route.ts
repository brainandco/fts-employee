import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDataClient } from "@/lib/supabase/server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const EXPIRES = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: row, error } = await supabase
    .from("employee_personal_files")
    .select("id, storage_key, file_name, upload_status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }
  if (row.upload_status !== "active") {
    return NextResponse.json({ message: "File is not available" }, { status: 400 });
  }

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: row.storage_key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(row.file_name)}"`,
  });
  const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn: EXPIRES });
  return NextResponse.json({ downloadUrl, expiresIn: EXPIRES });
}
