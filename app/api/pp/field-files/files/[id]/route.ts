import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getDataClient } from "@/lib/supabase/server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

/** DELETE — PP removes any employee file (metadata + object), same as admin. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: row, error } = await supabase
    .from("employee_personal_files")
    .select("id, storage_key")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  const bucket = getWasabiEmployeeFilesBucket();
  const s3 = getWasabiEmployeeFilesS3Client();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.storage_key }));
  } catch {
    /* continue */
  }
  const { error: del } = await supabase.from("employee_personal_files").delete().eq("id", id);
  if (del) {
    return NextResponse.json({ message: del.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
