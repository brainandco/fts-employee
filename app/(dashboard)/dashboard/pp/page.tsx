import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PostProcessorDashboardPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: me } = await supabase.from("employees").select("id, full_name").eq("email", email).maybeSingle();
  if (!me) redirect("/login");

  const { data: ppRole } = await supabase.from("employee_roles").select("role").eq("employee_id", me.id).eq("role", "PP").maybeSingle();
  if (!ppRole) redirect("/dashboard");

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, project_id, region_id, dt_employee_id, driver_rigger_employee_id")
    .order("name");

  const list = teams ?? [];
  const memberIds = [...new Set(list.flatMap((t) => [t.dt_employee_id, t.driver_rigger_employee_id].filter(Boolean) as string[]))];
  const projectIds = [...new Set(list.map((t) => t.project_id).filter(Boolean) as string[])];

  const [{ data: employees }, { data: projects }, { data: assets }, { data: sims }, { data: vAssign }] = await Promise.all([
    memberIds.length ? supabase.from("employees").select("id, full_name").in("id", memberIds) : { data: [] },
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : { data: [] },
    memberIds.length
      ? supabase
          .from("assets")
          .select("id, name, serial, category, status, assigned_to_employee_id")
          .in("assigned_to_employee_id", memberIds)
          .order("name")
      : { data: [] },
    memberIds.length
      ? supabase
          .from("sim_cards")
          .select("id, sim_number, phone_number, operator, service_type, status, assigned_to_employee_id")
          .in("assigned_to_employee_id", memberIds)
          .order("assigned_at", { ascending: false })
      : { data: [] },
    memberIds.length
      ? supabase.from("vehicle_assignments").select("vehicle_id, employee_id").in("employee_id", memberIds)
      : { data: [] },
  ]);

  const vehicleIds = [...new Set((vAssign ?? []).map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, plate_number, make, model, status").in("id", vehicleIds)
    : { data: [] };
  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  const projectById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  type AssetRow = {
    id: string;
    name: string | null;
    serial: string | null;
    category: string | null;
    status: string | null;
    assigned_to_employee_id: string | null;
  };
  const assetList = (assets ?? []) as AssetRow[];
  const assetsByAssignee = new Map<string, AssetRow[]>();
  for (const a of assetList) {
    const aid = a.assigned_to_employee_id;
    if (!aid) continue;
    if (!assetsByAssignee.has(aid)) assetsByAssignee.set(aid, []);
    assetsByAssignee.get(aid)!.push(a);
  }

  type SimRow = {
    id: string;
    sim_number: string | null;
    phone_number: string | null;
    operator: string | null;
    service_type: string | null;
    status: string | null;
    assigned_to_employee_id: string | null;
  };
  const simsByAssignee = new Map<string, SimRow[]>();
  for (const s of (sims ?? []) as SimRow[]) {
    const sid = s.assigned_to_employee_id;
    if (!sid) continue;
    if (!simsByAssignee.has(sid)) simsByAssignee.set(sid, []);
    simsByAssignee.get(sid)!.push(s);
  }

  type VaRow = { vehicle_id: string; employee_id: string };
  const vehiclesByAssignee = new Map<string, { plate_number: string | null; make: string | null; model: string | null; status: string | null }[]>();
  for (const row of (vAssign ?? []) as VaRow[]) {
    const v = vehicleById.get(row.vehicle_id);
    if (!v) continue;
    const list = vehiclesByAssignee.get(row.employee_id) ?? [];
    list.push({ plate_number: v.plate_number, make: v.make, model: v.model, status: v.status });
    vehiclesByAssignee.set(row.employee_id, list);
  }

  return (
    <div className="space-y-8">
      <nav className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Post Processor</span>
      </nav>

      <header className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Teams you supervise</h1>
        <p className="mt-1 text-sm text-zinc-600">
          You see teams where you are set as Post Processor on the team, or where your employee region and formal project match the team (same as Admin
          assignments). Tools follow the DT; Driver/Rigger shows SIMs and vehicles only.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/pp/leaves"
            className="rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50"
          >
            Team leave requests
          </Link>
          <Link href="/dashboard/pp/teams" className="text-sm font-medium text-teal-800 underline hover:text-teal-950">
            Alternate team view →
          </Link>
        </div>
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No teams visible yet. Ensure your employee has the same region and formal project as the team in Admin, or ask an administrator to set you as
          Post Processor on the team.
        </p>
      ) : (
        <div className="space-y-6">
          {list.map((team) => {
            const dtId = team.dt_employee_id;
            const drId = team.driver_rigger_employee_id;
            const samePerson = dtId && drId && dtId === drId;
            const projName = team.project_id ? projectById.get(team.project_id) ?? "—" : "—";
            return (
              <section key={team.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">{team.name}</h2>
                  <span className="text-sm text-zinc-500">Project: {projName}</span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                  {samePerson ? (
                    <li>
                      <strong>Self DT:</strong> {dtId ? nameById.get(dtId) ?? dtId : "—"}
                    </li>
                  ) : (
                    <>
                      <li>
                        <strong>DT:</strong> {dtId ? nameById.get(dtId) ?? dtId : "—"}
                      </li>
                      <li>
                        <strong>Driver/Rigger:</strong> {drId ? nameById.get(drId) ?? drId : "—"}
                      </li>
                    </>
                  )}
                </ul>

                <h3 className="mt-4 text-sm font-medium text-zinc-800">Assignments by member</h3>
                {!dtId && !drId ? (
                  <p className="mt-1 text-sm text-zinc-500">No members on this team.</p>
                ) : (
                  <div className="mt-2 space-y-6">
                    {[dtId, drId].filter(Boolean).filter((id, i, arr) => arr.indexOf(id) === i).map((mid) => {
                      const rows = assetsByAssignee.get(mid!) ?? [];
                      const simRows = simsByAssignee.get(mid!) ?? [];
                      const vehRows = vehiclesByAssignee.get(mid!) ?? [];
                      const hideTools =
                        Boolean(drId && dtId && drId !== dtId && mid === drId);
                      return (
                        <div key={mid}>
                          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{nameById.get(mid!) ?? mid}</p>
                          {!hideTools ? (
                            <>
                              <p className="mt-2 text-xs font-medium text-zinc-600">Tools</p>
                              {rows.length === 0 ? (
                                <p className="mt-1 text-sm text-zinc-500">No tools assigned.</p>
                              ) : (
                                <ul className="mt-1 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
                                  {rows.map((a) => (
                                    <li key={a.id} className="flex flex-wrap gap-2 px-3 py-2 text-sm">
                                      <span className="font-medium text-zinc-900">{a.name ?? "—"}</span>
                                      <span className="text-zinc-600">{a.serial ?? "—"}</span>
                                      <span className="text-zinc-500">{a.category ?? ""}</span>
                                      <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-700">{a.status ?? ""}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          ) : null}
                          <p className="mt-3 text-xs font-medium text-zinc-600">SIMs</p>
                          {simRows.length === 0 ? (
                            <p className="mt-1 text-sm text-zinc-500">No SIM assigned.</p>
                          ) : (
                            <ul className="mt-1 space-y-1 rounded-lg border border-fuchsia-100 bg-fuchsia-50/30 px-3 py-2 text-sm text-zinc-700">
                              {simRows.map((s) => (
                                <li key={s.id}>
                                  {s.sim_number ?? "—"}
                                  {s.phone_number ? <span className="text-zinc-500"> · {s.phone_number}</span> : null}
                                  <span className="text-zinc-500"> — {s.status ?? ""}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-3 text-xs font-medium text-zinc-600">Vehicles</p>
                          {vehRows.length === 0 ? (
                            <p className="mt-1 text-sm text-zinc-500">No vehicle assignment.</p>
                          ) : (
                            <ul className="mt-1 space-y-1 rounded-lg border border-sky-100 bg-sky-50/30 px-3 py-2 text-sm text-zinc-700">
                              {vehRows.map((v, i) => (
                                <li key={`${mid}-v-${i}`}>
                                  <span className="font-medium">{v.plate_number ?? "—"}</span>
                                  {(v.make || v.model) && (
                                    <span className="text-zinc-500"> — {[v.make, v.model].filter(Boolean).join(" ")}</span>
                                  )}
                                  {v.status ? <span className="text-zinc-500"> ({v.status})</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
