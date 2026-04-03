import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { TransferRequestsClient } from "./TransferRequestsClient";

export default async function TransferRequestsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, full_name, status")
    .eq("email", email)
    .maybeSingle();
  if (!employee || employee.status !== "ACTIVE" || !employee.region_id) redirect("/dashboard");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const canRequestAssetTransfer = roleSet.has("DT");
  const canRequestVehicleFlows = roleSet.has("Driver/Rigger");
  const canRequest = canRequestAssetTransfer || canRequestVehicleFlows;
  const canReview = roleSet.has("QC") || roleSet.has("Project Manager");
  if (!canRequest && !canReview) redirect("/dashboard");

  const { data: requests } = await supabase
    .from("transfer_requests")
    .select("*")
    .or(canReview ? `requester_employee_id.eq.${employee.id},requester_region_id.eq.${employee.region_id}` : `requester_employee_id.eq.${employee.id}`)
    .order("created_at", { ascending: false });

  const { data: regionEmployees } = await supabase
    .from("employees")
    .select("id, full_name, region_id, status")
    .eq("region_id", employee.region_id)
    .eq("status", "ACTIVE");
  const regionEmployeeIds = (regionEmployees ?? []).map((e) => e.id);
  const { data: regionRoles } = regionEmployeeIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", regionEmployeeIds)
    : { data: [] };

  const roleMap = new Map<string, Set<string>>();
  for (const r of regionRoles ?? []) {
    if (!roleMap.has(r.employee_id)) roleMap.set(r.employee_id, new Set());
    roleMap.get(r.employee_id)!.add(r.role);
  }
  const drivers = (regionEmployees ?? []).filter((e) => roleMap.get(e.id)?.has("Driver/Rigger"));
  const dts = (regionEmployees ?? []).filter((e) => roleMap.get(e.id)?.has("DT"));

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, region_id, driver_rigger_employee_id")
    .eq("region_id", employee.region_id)
    .not("driver_rigger_employee_id", "is", null);

  const { data: myAssets } = await supabase
    .from("assets")
    .select("id, name, serial, assigned_to_employee_id, status")
    .eq("assigned_to_employee_id", employee.id)
    .eq("status", "Assigned");

  const { data: replacementVehicles } = await supabase
    .from("vehicles")
    .select("id, plate_number, make, model, status, assigned_region_id, assignment_type")
    .eq("assignment_type", "Temporary")
    .eq("status", "Available")
    .or(`assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null`)
    .order("plate_number");

  const selectedEmployees = canRequest && canReview
    ? (regionEmployees ?? [])
    : canRequest
      ? [...drivers, ...dts]
      : (regionEmployees ?? []);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Transfer requests</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Transfer requests</h1>
        <p className="fts-page-desc">
          DT and Driver/Rigger can request vehicle or asset transfer actions. QC/PM can review and apply approved transfers.
        </p>
      </div>

      <TransferRequestsClient
        canRequest={canRequest}
        canReview={canReview}
        canRequestAssetTransfer={canRequestAssetTransfer}
        canRequestVehicleFlows={canRequestVehicleFlows}
        meId={employee.id}
        requests={(requests ?? []) as never[]}
        employees={selectedEmployees.map((e) => ({
          id: e.id,
          full_name: e.full_name,
        }))}
        teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name, driver_rigger_employee_id: t.driver_rigger_employee_id }))}
        myAssets={(myAssets ?? []).map((a) => ({ id: a.id, name: a.name, serial: a.serial }))}
        replacementVehicles={(replacementVehicles ?? []).map((v) => ({ id: v.id, plate_number: v.plate_number, make: v.make, model: v.model }))}
      />
    </div>
  );
}
