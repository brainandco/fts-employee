import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { mapLeaveApprovalRow } from "@/lib/mobile/leave-requests";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — current user's leave requests (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind === "denied") {
    return NextResponse.json({ message: access.message }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: rows, error } = await supabase
    .from("approvals")
    .select("id, status, created_at, payload_json, admin_comment, pm_comment")
    .eq("requester_id", auth.user.id)
    .eq("approval_type", "leave_request")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const items = (rows ?? []).map(mapLeaveApprovalRow);

  return NextResponse.json({ items });
}
