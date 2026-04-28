import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { resolveEmployeeFileAccess } from "@/lib/employee-files/access";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const EXPIRES = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

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
    return NextResponse.json({ message: "Download is allowed for PM, PP, and Team Lead only." }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from("employee_personal_files")
    .select("id, employee_id, storage_key, file_name, mime_type, upload_status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }
  if (row.employee_id !== me.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (row.upload_status !== "active") {
    return NextResponse.json({ message: "File is not available yet" }, { status: 400 });
  }

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: row.storage_key, ResponseContentDisposition: `attachment; filename="${encodeURIComponent(row.file_name)}"` });
  const url = await getSignedUrl(s3, cmd, { expiresIn: EXPIRES });
  return NextResponse.json({ downloadUrl: url, expiresIn: EXPIRES });
}
