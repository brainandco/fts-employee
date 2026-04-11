import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { canAccessSoftwareLibrary } from "@/lib/software/library-access";
import { getWasabiBucket, getWasabiS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const EXPIRES_SEC = 900;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  if (!(await canAccessSoftwareLibrary(supabase, email))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { data: software, error } = await supabase
    .from("portal_software")
    .select("id, storage_key, file_name, mime_type, upload_status")
    .eq("id", id)
    .maybeSingle();

  if (error || !software) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (software.upload_status !== "active") return NextResponse.json({ message: "Unavailable" }, { status: 400 });

  try {
    const client = getWasabiS3Client();
    const bucket = getWasabiBucket();
    const safeName = (software.file_name ?? "download").replace(/"/g, "");
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: software.storage_key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    });
    const url = await getSignedUrl(client, cmd, { expiresIn: EXPIRES_SEC });
    return NextResponse.json({
      url,
      expiresIn: EXPIRES_SEC,
      file_name: software.file_name,
      mime_type: software.mime_type,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create download link";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
