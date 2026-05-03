import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PpTeamMemberTabs, type PpTeamMemberTab } from "@/components/pp/PpTeamMemberTabs";
import { hasReportingPortalRole } from "@/lib/pp/auth";

type AssetRow = {
  id: string;
  name: string | null;
  serial: string | null;
  category: string | null;
  status: string | null;
  assigned_to_employee_id: string | null;
};

export default async function PpTeamsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: employee } = await supabase.from("employees").select("id, full_name").eq("email", email).maybeSingle();
  if (!employee) redirect("/login");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  if (!hasReportingPortalRole(roles ?? [])) redirect("/dashboard");

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, project_id, dt_employee_id, driver_rigger_employee_id, region_id")
    .order("name");

  const teamList = teams ?? [];
  const projectIds = [...new Set(teamList.map((t) => t.project_id).filter(Boolean))] as string[];
  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] };
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const memberIds = new Set<string>();
  for (const t of teamList) {
    if (t.dt_employee_id) memberIds.add(t.dt_employee_id);
    if (t.driver_rigger_employee_id) memberIds.add(t.driver_rigger_employee_id);
  }
  const memberIdList = [...memberIds];

  const { data: memberNames } = memberIdList.length
    ? await supabase.from("employees").select("id, full_name").in("id", memberIdList)
    : { data: [] };
  const nameById = new Map((memberNames ?? []).map((e) => [e.id, e.full_name]));

  const [{ data: memberAssets }, { data: memberSims }, { data: vAssign }] = await Promise.all([
    memberIdList.length
      ? supabase
          .from("assets")
          .select("id, name, serial, category, status, assigned_to_employee_id")
          .in("assigned_to_employee_id", memberIdList)
          .order("name")
      : { data: [] },
    memberIdList.length
      ? supabase
          .from("sim_cards")
          .select("id, sim_number, phone_number, operator, status, assigned_to_employee_id")
          .in("assigned_to_employee_id", memberIdList)
          .order("assigned_at", { ascending: false })
      : { data: [] },
    memberIdList.length
      ? supabase.from("vehicle_assignments").select("vehicle_id, employee_id").in("employee_id", memberIdList)
      : { data: [] },
  ]);

  const vehicleIds = [...new Set((vAssign ?? []).map((r: { vehicle_id: string }) => r.vehicle_id).filter(Boolean))] as string[];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, plate_number, make, model, status").in("id", vehicleIds)
    : { data: [] };
  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));

  const assetsByEmployee = new Map<string, AssetRow[]>();
  for (const a of memberAssets ?? []) {
    const aid = a.assigned_to_employee_id;
    if (!aid) continue;
    const arr = assetsByEmployee.get(aid) ?? [];
    arr.push(a as AssetRow);
    assetsByEmployee.set(aid, arr);
  }

  type SimRow = {
    id: string;
    sim_number: string | null;
    phone_number: string | null;
    operator: string | null;
    status: string | null;
    assigned_to_employee_id: string | null;
  };
  const simsByEmployee = new Map<string, SimRow[]>();
  for (const s of (memberSims ?? []) as SimRow[]) {
    const sid = s.assigned_to_employee_id;
    if (!sid) continue;
    const arr = simsByEmployee.get(sid) ?? [];
    arr.push(s);
    simsByEmployee.set(sid, arr);
  }

  type VaRow = { vehicle_id: string; employee_id: string };
  const vehiclesByEmployee = new Map<string, { plate_number: string | null; make: string | null; model: string | null; status: string | null }[]>();
  for (const row of (vAssign ?? []) as VaRow[]) {
    const v = vehicleById.get(row.vehicle_id);
    if (!v) continue;
    const arr = vehiclesByEmployee.get(row.employee_id) ?? [];
    arr.push({ plate_number: v.plate_number, make: v.make, model: v.model, status: v.status });
    vehiclesByEmployee.set(row.employee_id, arr);
  }

  return (
    <div className="space-y-6">
      <nav className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">My teams (reporting)</span>
      </nav>

      <section className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 via-emerald-50 to-slate-50 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Teams assigned to you</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-700">
          Open a team and use the member tabs: tools for DT, SIMs and vehicles for each member.
        </p>
        <p className="mt-3">
          <Link href="/dashboard/pp/leaves" className="text-sm font-medium text-teal-800 underline hover:text-teal-950">
            Team leave requests →
          </Link>
        </p>
      </section>

      {teamList.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          No teams visible yet. Ask an admin to confirm team rosters and your reporting access. If you have a home region
          and project on your employee record, teams that match those values will also appear once set in Admin.
        </p>
      ) : (
        <ul className="space-y-6">
          {teamList.map((team) => {
            const dtId = team.dt_employee_id;
            const drId = team.driver_rigger_employee_id;
            const projName = team.project_id ? projectNameById.get(team.project_id) ?? "—" : "—";
            const dtName = dtId ? nameById.get(dtId)?.trim() || "" : "";
            const drName = drId ? nameById.get(drId)?.trim() || "" : "";

            const memberTabs: PpTeamMemberTab[] = [];
            if (dtId && drId && dtId === drId) {
              const label = dtName ? `${dtName} (Self DT)` : "Self DT";
              memberTabs.push({
                tabId: dtId,
                tabLabel: label,
                roleLabel: "Self DT",
                assets: assetsByEmployee.get(dtId) ?? [],
                sims: simsByEmployee.get(dtId) ?? [],
                vehicles: vehiclesByEmployee.get(dtId) ?? [],
              });
            } else {
              const sameDisplayName = dtId && drId && dtName !== "" && dtName === drName;
              if (dtId) {
                memberTabs.push({
                  tabId: dtId,
                  tabLabel: sameDisplayName ? `${dtName} (DT)` : dtName || "DT",
                  roleLabel: "DT",
                  assets: assetsByEmployee.get(dtId) ?? [],
                  sims: simsByEmployee.get(dtId) ?? [],
                  vehicles: vehiclesByEmployee.get(dtId) ?? [],
                });
              }
              if (drId && drId !== dtId) {
                memberTabs.push({
                  tabId: drId,
                  tabLabel: sameDisplayName ? `${drName} (Driver/Rigger)` : drName || "Driver/Rigger",
                  roleLabel: "Driver/Rigger",
                  assets: assetsByEmployee.get(drId) ?? [],
                  sims: simsByEmployee.get(drId) ?? [],
                  vehicles: vehiclesByEmployee.get(drId) ?? [],
                });
              }
            }

            return (
              <li key={team.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-100 bg-zinc-50/80 px-5 py-4">
                  <h2 className="text-lg font-semibold text-zinc-900">{team.name}</h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    Project: <strong className="text-zinc-800">{projName}</strong>
                  </p>
                </div>
                <PpTeamMemberTabs key={team.id} members={memberTabs} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
