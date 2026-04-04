import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { REGION_FALLBACK_TEAM_ID } from "@/lib/transfer-requests/constants";
import { TransferRequestsClient } from "./TransferRequestsClient";

type EmpRow = { id: string; full_name: string | null };

function uniqueById(rows: EmpRow[]): EmpRow[] {
  const m = new Map<string, EmpRow>();
  for (const r of rows) {
    if (!m.has(r.id)) m.set(r.id, r);
  }
  return [...m.values()];
}

export type TeamMemberPick = {
  teamId: string;
  teamName: string;
  members: { id: string; full_name: string }[];
};

function flattenExcludedTeams(teams: TeamMemberPick[], excludeId: string): { id: string; full_name: string }[] {
  const map = new Map<string, string>();
  for (const t of teams) {
    for (const m of t.members) {
      if (m.id === excludeId) continue;
      if (!map.has(m.id)) map.set(m.id, m.full_name);
    }
  }
  return [...map.entries()]
    .map(([id, full_name]) => ({ id, full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
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

  const { data: regionTeamsFull } = await supabase
    .from("teams")
    .select("id, name, region_id, dt_employee_id, driver_rigger_employee_id")
    .eq("region_id", employee.region_id);

  const regionIds = (regionEmployees ?? []).map((e) => e.id);
  const teamMemberIds = new Set<string>();
  for (const t of regionTeamsFull ?? []) {
    if (t.dt_employee_id) teamMemberIds.add(t.dt_employee_id as string);
    if (t.driver_rigger_employee_id) teamMemberIds.add(t.driver_rigger_employee_id as string);
  }
  const allRoleIds = [...new Set([...regionIds, ...teamMemberIds])];
  const { data: allRoleRows } = allRoleIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", allRoleIds)
    : { data: [] };

  const roleMap = new Map<string, Set<string>>();
  for (const r of allRoleRows ?? []) {
    if (!roleMap.has(r.employee_id)) roleMap.set(r.employee_id, new Set());
    roleMap.get(r.employee_id)!.add(r.role as string);
  }

  const missingForNames = [...teamMemberIds].filter((id) => !regionIds.includes(id));
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

  const vehicleSwapTeams: TeamMemberPick[] = [];
  const coveredDriverIds = new Set<string>();

  for (const t of regionTeamsFull ?? []) {
    const dr = t.driver_rigger_employee_id as string | null;
    if (!dr || dr === employee.id) continue;
    if (!isVehicleRole(dr)) continue;
    const row = empById.get(dr);
    if (!row) continue;
    coveredDriverIds.add(dr);
    vehicleSwapTeams.push({
      teamId: t.id as string,
      teamName: (typeof t.name === "string" && t.name.trim()) ? t.name.trim() : "Team",
      members: [{ id: dr, full_name: row.full_name ?? dr }],
    });
  }

  vehicleSwapTeams.sort((a, b) => a.teamName.localeCompare(b.teamName));

  const regionOnlyDrivers: { id: string; full_name: string }[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isVehicleRole(e.id)) continue;
    if (coveredDriverIds.has(e.id)) continue;
    regionOnlyDrivers.push({ id: e.id, full_name: e.full_name ?? e.id });
  }
  regionOnlyDrivers.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (regionOnlyDrivers.length > 0) {
    vehicleSwapTeams.push({
      teamId: REGION_FALLBACK_TEAM_ID,
      teamName: "Other drivers in your region",
      members: regionOnlyDrivers,
    });
  }

  const assetTransferTeams: TeamMemberPick[] = [];
  const coveredDtIds = new Set<string>();

  for (const t of regionTeamsFull ?? []) {
    const dt = t.dt_employee_id as string | null;
    if (!dt || dt === employee.id) continue;
    if (!isAssetRole(dt)) continue;
    const row = empById.get(dt);
    if (!row) continue;
    coveredDtIds.add(dt);
    assetTransferTeams.push({
      teamId: t.id as string,
      teamName: (typeof t.name === "string" && t.name.trim()) ? t.name.trim() : "Team",
      members: [{ id: dt, full_name: row.full_name ?? dt }],
    });
  }

  assetTransferTeams.sort((a, b) => a.teamName.localeCompare(b.teamName));

  const regionOnlyDts: { id: string; full_name: string }[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isAssetRole(e.id)) continue;
    if (coveredDtIds.has(e.id)) continue;
    regionOnlyDts.push({ id: e.id, full_name: e.full_name ?? e.id });
  }
  regionOnlyDts.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (regionOnlyDts.length > 0) {
    assetTransferTeams.push({
      teamId: REGION_FALLBACK_TEAM_ID,
      teamName: "Other DTs in your region",
      members: regionOnlyDts,
    });
  }

  const employeesForLabels = uniqueById([
    ...(regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name })),
    ...vehicleSwapTeams.flatMap((x) => x.members.map((m) => ({ id: m.id, full_name: m.full_name }))),
    ...assetTransferTeams.flatMap((x) => x.members.map((m) => ({ id: m.id, full_name: m.full_name }))),
  ]);

  const teamLabels: Record<string, string> = {};
  for (const t of regionTeamsFull ?? []) {
    teamLabels[t.id as string] = (typeof t.name === "string" && t.name.trim()) ? t.name.trim() : "Team";
  }
  teamLabels[REGION_FALLBACK_TEAM_ID] = "Other (region)";

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
          Choose a team, then the driver (vehicle swap) or DT (asset transfer). Self DT uses the same flow: other teams’ drivers or DTs appear under each team. “Other in region” lists people not matched to a team row above.
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
        vehicleSwapDrivers={flattenExcludedTeams(vehicleSwapTeams, employee.id)}
        assetTransferDts={flattenExcludedTeams(assetTransferTeams, employee.id)}
        driveSwapDrivers={flattenExcludedTeams(vehicleSwapTeams, employee.id)}
        teamLabels={teamLabels}
        myAssets={(myAssets ?? []).map((a) => ({ id: a.id, name: a.name, serial: a.serial }))}
        replacementVehicles={(replacementVehicles ?? []).map((v) => ({ id: v.id, plate_number: v.plate_number, make: v.make, model: v.model }))}
      />
    </div>
  );
}
