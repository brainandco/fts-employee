import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { TransferRequestsClient } from "./TransferRequestsClient";

type EmpRow = { id: string; full_name: string | null };

function uniqueById(rows: EmpRow[]): EmpRow[] {
  const m = new Map<string, EmpRow>();
  for (const r of rows) {
    if (!m.has(r.id)) m.set(r.id, r);
  }
  return [...m.values()];
}

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
  const isSelfDt = roleSet.has("Self DT");
  const canRequestAssetTransfer = roleSet.has("DT") || isSelfDt;
  const canRequestVehicleFlows = roleSet.has("Driver/Rigger") || isSelfDt;
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

  const { data: myTeams } = await supabase
    .from("teams")
    .select("id, name, dt_employee_id, driver_rigger_employee_id")
    .or(`dt_employee_id.eq.${employee.id},driver_rigger_employee_id.eq.${employee.id}`);

  const teamPeerIds = new Set<string>();
  for (const t of myTeams ?? []) {
    if (t.dt_employee_id && t.dt_employee_id !== employee.id) teamPeerIds.add(t.dt_employee_id as string);
    if (t.driver_rigger_employee_id && t.driver_rigger_employee_id !== employee.id) {
      teamPeerIds.add(t.driver_rigger_employee_id as string);
    }
  }

  const regionIds = (regionEmployees ?? []).map((e) => e.id);
  const allRoleIds = [...new Set([...regionIds, ...teamPeerIds])];
  const { data: allRoleRows } = allRoleIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", allRoleIds)
    : { data: [] };

  const roleMap = new Map<string, Set<string>>();
  for (const r of allRoleRows ?? []) {
    if (!roleMap.has(r.employee_id)) roleMap.set(r.employee_id, new Set());
    roleMap.get(r.employee_id)!.add(r.role as string);
  }

  const missingForNames = [...teamPeerIds].filter((id) => !regionIds.includes(id));
  const { data: extraEmployees } = missingForNames.length
    ? await supabase.from("employees").select("id, full_name, status").in("id", missingForNames).eq("status", "ACTIVE")
    : { data: [] };

  const empById = new Map<string, EmpRow>();
  for (const e of regionEmployees ?? []) empById.set(e.id, { id: e.id, full_name: e.full_name });
  for (const e of extraEmployees ?? []) empById.set(e.id, { id: e.id, full_name: e.full_name });

  function isVehicleRole(id: string): boolean {
    const s = roleMap.get(id);
    return !!(s?.has("Driver/Rigger") || s?.has("Self DT"));
  }
  function isAssetRole(id: string): boolean {
    const s = roleMap.get(id);
    return !!(s?.has("DT") || s?.has("Self DT"));
  }

  const teamPeerIdArr = [...teamPeerIds];

  const teamVehicle: EmpRow[] = [];
  for (const id of teamPeerIdArr) {
    if (id === employee.id || !isVehicleRole(id)) continue;
    const row = empById.get(id);
    if (row) teamVehicle.push(row);
  }
  teamVehicle.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const teamVehicleIds = new Set(teamVehicle.map((e) => e.id));
  const regionVehicle: EmpRow[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isVehicleRole(e.id)) continue;
    if (teamVehicleIds.has(e.id)) continue;
    regionVehicle.push({ id: e.id, full_name: e.full_name });
  }
  regionVehicle.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const teamAsset: EmpRow[] = [];
  for (const id of teamPeerIdArr) {
    if (id === employee.id || !isAssetRole(id)) continue;
    const row = empById.get(id);
    if (row) teamAsset.push(row);
  }
  teamAsset.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const teamAssetIds = new Set(teamAsset.map((e) => e.id));
  const regionAsset: EmpRow[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isAssetRole(e.id)) continue;
    if (teamAssetIds.has(e.id)) continue;
    regionAsset.push({ id: e.id, full_name: e.full_name });
  }
  regionAsset.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  const targetEmployeeGroupsVehicle = [
    { label: "Same team(s)", options: teamVehicle.map((e) => ({ id: e.id, full_name: e.full_name ?? e.id })) },
    { label: "Region (other drivers)", options: regionVehicle.map((e) => ({ id: e.id, full_name: e.full_name ?? e.id })) },
  ].filter((g) => g.options.length > 0);

  const targetEmployeeGroupsAsset = [
    { label: "Same team(s)", options: teamAsset.map((e) => ({ id: e.id, full_name: e.full_name ?? e.id })) },
    { label: "Region (other DTs)", options: regionAsset.map((e) => ({ id: e.id, full_name: e.full_name ?? e.id })) },
  ].filter((g) => g.options.length > 0);

  const employeesForLabels = uniqueById([
    ...(regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name })),
    ...teamVehicle,
    ...regionVehicle,
    ...teamAsset,
    ...regionAsset,
  ]);

  const selectedEmployees =
    canRequest && canReview
      ? (regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }))
      : canRequest
        ? uniqueById([...teamVehicle, ...regionVehicle, ...teamAsset, ...regionAsset])
        : (regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }));

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

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Transfer requests</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Transfer requests</h1>
        <p className="fts-page-desc">
          DT and Driver/Rigger can request vehicle or asset transfer actions. QC/PM can review and apply approved transfers. Target employees include your team(s) and others in your region with the right role.
        </p>
      </div>

      <TransferRequestsClient
        canRequest={canRequest}
        canReview={canReview}
        canRequestAssetTransfer={canRequestAssetTransfer}
        canRequestVehicleFlows={canRequestVehicleFlows}
        meId={employee.id}
        requests={(requests ?? []) as never[]}
        employees={employeesForLabels.map((e) => ({
          id: e.id,
          full_name: e.full_name ?? e.id,
        }))}
        targetEmployeeGroupsVehicle={targetEmployeeGroupsVehicle}
        targetEmployeeGroupsAsset={targetEmployeeGroupsAsset}
        teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name, driver_rigger_employee_id: t.driver_rigger_employee_id }))}
        myAssets={(myAssets ?? []).map((a) => ({ id: a.id, name: a.name, serial: a.serial }))}
        replacementVehicles={(replacementVehicles ?? []).map((v) => ({ id: v.id, plate_number: v.plate_number, make: v.make, model: v.model }))}
      />
    </div>
  );
}
