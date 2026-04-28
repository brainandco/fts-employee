import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { resolveEmployeeFileAccess } from "@/lib/employee-files/access";
import { NextResponse } from "next/server";

/** GET — list current employee's own files. */
export async function GET() {
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
    return NextResponse.json({ message: "View access is allowed for PM, PP, and Team Lead only." }, { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from("employee_personal_files")
    .select("id, file_name, mime_type, byte_size, upload_status, created_at, region_id")
    .eq("employee_id", me.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ files: rows ?? [] });
}
