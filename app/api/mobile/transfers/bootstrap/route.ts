import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { loadTransferBootstrap } from "@/lib/transfer-requests/load-transfer-bootstrap";

/** GET — transfer form data + requests for mobile (Bearer). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee account required" }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id, status")
    .eq("id", access.employeeId)
    .maybeSingle();

  if (!employee || employee.status !== "ACTIVE") {
    return NextResponse.json({ message: "Active employee record required" }, { status: 403 });
  }

  const bootstrap = await loadTransferBootstrap(
    supabase,
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    auth.user.id
  );

  if ("error" in bootstrap) {
    return NextResponse.json({ message: bootstrap.error }, { status: 403 });
  }

  return NextResponse.json(bootstrap);
}
