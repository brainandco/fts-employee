import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** GET: QC sees requests they created; PM sees pending requests for their region. */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isQc = roleSet.has("QC");
  const isPm = roleSet.has("Project Manager");

  if (isQc) {
    const { data } = await supabase
      .from("asset_replacement_requests")
      .select(`
        id, asset_id, for_employee_id, requested_by_employee_id, reason, notes, status, created_at,
        resolved_at, replacement_asset_id,
        assets:asset_id ( id, name, serial, category ),
        for_employee:for_employee_id ( id, full_name ),
        replacement_asset:replacement_asset_id ( id, name, serial )
      `)
      .eq("requested_by_employee_id", employee.id)
      .order("created_at", { ascending: false });
    return NextResponse.json({ requests: data ?? [], role: "qc" });
  }

  if (isPm) {
    const { data: all } = await supabase
      .from("asset_replacement_requests")
      .select(`
        id, asset_id, for_employee_id, requested_by_employee_id, reason, notes, status, created_at,
        resolved_at, resolved_by_employee_id, replacement_asset_id,
        assets:asset_id ( id, name, serial, category ),
        for_employee:for_employee_id ( id, full_name ),
        requested_by:requested_by_employee_id ( id, full_name ),
        replacement_asset:replacement_asset_id ( id, name, serial )
      `)
      .order("created_at", { ascending: false });
    const forIds = [...new Set((all ?? []).map((r: { for_employee_id: string }) => r.for_employee_id))];
    const { data: forEmps } = forIds.length
      ? await supabase.from("employees").select("id, region_id").in("id", forIds)
      : { data: [] };
    const regionByEmp = new Map((forEmps ?? []).map((e) => [e.id, e.region_id]));
    const requests = (all ?? []).filter((r: { for_employee_id: string }) => {
      if (!employee.region_id) return true;
      return regionByEmp.get(r.for_employee_id) === employee.region_id;
    });
    return NextResponse.json({ requests, role: "pm" });
  }

  return NextResponse.json({ requests: [], role: "employee" });
}

/** POST: QC creates a replacement request for an asset (not OK for use). */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const asset_id = typeof body.asset_id === "string" ? body.asset_id.trim() : "";
  const for_employee_id = typeof body.for_employee_id === "string" ? body.for_employee_id.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!asset_id || !for_employee_id || !reason) {
    return NextResponse.json({ message: "asset_id, for_employee_id, and reason required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: qcRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "QC")
    .maybeSingle();
  if (!qcRole) return NextResponse.json({ message: "Only QC can request replacement from PM" }, { status: 403 });

  const { data: forEmp } = await supabase.from("employees").select("id, region_id").eq("id", for_employee_id).single();
  if (!forEmp) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });
  if (forEmp.region_id !== employee.region_id) {
    return NextResponse.json({ message: "Employee must be in your region" }, { status: 400 });
  }

  const { data: asset } = await supabase.from("assets").select("id").eq("id", asset_id).single();
  if (!asset) return NextResponse.json({ message: "Asset not found" }, { status: 404 });

  const { data: inserted, error } = await supabase
    .from("asset_replacement_requests")
    .insert({
      asset_id,
      for_employee_id,
      requested_by_employee_id: employee.id,
      reason,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      status: "Pending",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ id: inserted.id, message: "Request sent to Project Manager" });
}
