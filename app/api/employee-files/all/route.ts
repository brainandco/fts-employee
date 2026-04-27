import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { deleteS3Keys } from "@/lib/employee-files/batch-delete-s3";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

/**
 * DELETE — remove all of the current employee's file metadata and their objects in storage.
 */
export async function DELETE() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase
    .from("employees")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  if (!me || me.status !== "ACTIVE") {
    return NextResponse.json({ message: "No active employee profile" }, { status: 403 });
  }

  const { data: rows, error: qErr } = await supabase
    .from("employee_personal_files")
    .select("id, storage_key")
    .eq("employee_id", me.id);
  if (qErr) {
    return NextResponse.json({ message: qErr.message }, { status: 400 });
  }
  const list = rows ?? [];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, removed: 0 });
  }

  const keys = list.map((r) => r.storage_key);
  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();
  try {
    await deleteS3Keys(s3, bucket, keys);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Storage delete failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const { error: delErr } = await supabase.from("employee_personal_files").delete().eq("employee_id", me.id);
  if (delErr) {
    return NextResponse.json({ message: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, removed: list.length });
}
