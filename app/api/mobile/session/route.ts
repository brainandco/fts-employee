import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — mobile app session + portal access (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind === "denied") {
    return NextResponse.json({ message: access.message, reason: access.reason }, { status: 403 });
  }

  return NextResponse.json({ access });
}
