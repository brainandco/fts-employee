import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Asset creation is admin-only. PM can request assets from admin. */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  await req.json().catch(() => ({}));

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  return NextResponse.json(
    { message: "Asset creation is Admin-only. Please request assets from Admin." },
    { status: 403 }
  );
}
