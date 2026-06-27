import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { loadEmployeeWorkInfo } from "@/lib/mobile/employee-work-info";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — profile settings payload for mobile (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind === "denied") {
    return NextResponse.json({ message: access.message }, { status: 403 });
  }

  const supabase = await getDataClient();
  const email = auth.user.email?.trim().toLowerCase() ?? "";

  if (access.kind === "admin_view") {
    const { data: profile } = await supabase
      .from("users_profile")
      .select("full_name, avatar_url")
      .eq("id", auth.user.id)
      .maybeSingle();

    return NextResponse.json({
      mode: "admin_view" as const,
      email,
      fullName: (profile?.full_name as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      phone: null,
      accommodations: null,
      profileUpdateRequests: [],
    });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, phone, accommodations, avatar_url")
    .eq("id", access.employeeId)
    .maybeSingle();

  const { data: requests } = await supabase
    .from("employee_profile_update_requests")
    .select(
      "id, status, requested_full_name, requested_phone, requested_email, note_from_employee, created_at, resolved_at"
    )
    .eq("employee_id", access.employeeId)
    .order("created_at", { ascending: false })
    .limit(25);

  const work = await loadEmployeeWorkInfo(supabase, access.employeeId);

  return NextResponse.json({
    mode: "employee" as const,
    email,
    fullName: (employee?.full_name as string | null) ?? null,
    phone: (employee?.phone as string | null) ?? null,
    accommodations: (employee?.accommodations as string | null) ?? null,
    avatarUrl: (employee?.avatar_url as string | null) ?? null,
    profileUpdateRequests: requests ?? [],
    work,
  });
}
