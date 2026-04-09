import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Employees in the same region as the current user (for leave guarantor picker). */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const { data: me } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", (session.user.email ?? "").trim().toLowerCase())
    .maybeSingle();

  if (!me?.region_id) {
    return NextResponse.json({ employees: [] });
  }

  const { data: rows } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department")
    .eq("region_id", me.region_id)
    .eq("status", "ACTIVE")
    .neq("id", me.id)
    .order("full_name");

  return NextResponse.json({
    employees: (rows ?? []).map((e) => ({
      id: e.id,
      full_name: (e.full_name ?? "").trim() || e.id,
      subtitle: [e.job_title, e.department].filter(Boolean).join(" · ") || "",
    })),
  });
}
