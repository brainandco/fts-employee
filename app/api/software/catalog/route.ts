import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { canAccessSoftwareLibrary } from "@/lib/software/library-access";
import { NextResponse } from "next/server";

/** List active software (metadata only). Any logged-in portal user who passes layout may read. */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const allowed = await canAccessSoftwareLibrary(supabase, email);
  if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("portal_software")
    .select("id, title, description, file_name, mime_type, byte_size, created_at")
    .eq("upload_status", "active")
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}
