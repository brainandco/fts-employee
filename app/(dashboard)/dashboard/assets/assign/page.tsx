import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadPmScopeIds, loadPmRegionEmployeeOptions, loadAllRegionEmployeeAssigneeOptions } from "@/lib/pm-team-assignees";
import { resolvePortalAdminAssetAssigner } from "@/lib/portal-asset-assign-auth";
import { PmAssignToEmployeeClient } from "./PmAssignToEmployeeClient";
import { PmAssignEhsToolsClient } from "@/components/ehs/PmAssignEhsToolsClient";
import { FleetEhsSectionTabs } from "@/components/ui/FleetEhsSectionTabs";
import { parseFleetEhsTab } from "@/lib/assets/fleet-ehs-tabs";

export default async function PmAssignAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) redirect("/login");

  const sp = (await Promise.resolve(searchParams ?? {})) as { tab?: string };
  const tab = parseFleetEhsTab(sp.tab);

  const email = (session.user.email ?? "").trim();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, region_id, project_id")
    .eq("email", email)
    .maybeSingle();

  const { data: roles } = employee
    ? await supabase.from("employee_roles").select("role").eq("employee_id", employee.id)
    : { data: [] };
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, session.user.id, email);

  if (!isPm && !isPortalAdmin) redirect("/dashboard");

  type AssetRow = {
    id: string;
    name: string | null;
    category: string | null;
    model: string | null;
    serial: string | null;
    imei_1: string | null;
    imei_2: string | null;
    status: string;
    assigned_to_employee_id?: string | null;
  };
  type CatalogRow = AssetRow & { assigneeName: string | null };
  let assets: AssetRow[] = [];
  let searchCatalog: CatalogRow[] = [];
  let assignees: { id: string; label: string }[] = [];

  async function attachAssigneeNames(rows: AssetRow[]): Promise<CatalogRow[]> {
    const empIds = [...new Set(rows.map((r) => r.assigned_to_employee_id).filter(Boolean) as string[])];
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, full_name, email").in("id", empIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const nameById = new Map(
      (emps ?? []).map((e) => [e.id, (e.full_name ?? e.email ?? "Employee").trim() || "Employee"])
    );
    return rows.map((r) => ({
      ...r,
      assigneeName: r.assigned_to_employee_id ? (nameById.get(r.assigned_to_employee_id) ?? "Employee") : null,
    }));
  }

  let allowedRegionIds: string[] = [];
  if (isPm && employee) {
    const scope = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      session.user.id
    );
    allowedRegionIds = scope.allowedRegionIds;
  }

  if (isPortalAdmin) {
    const { data: catalogRows } = await supabase
      .from("assets")
      .select("id, name, category, model, serial, imei_1, imei_2, status, assigned_to_employee_id")
      .eq("is_ehs_tool", false)
      .order("name");
    searchCatalog = await attachAssigneeNames(catalogRows ?? []);
    assets = searchCatalog.filter((a) => a.status === "Available");
    assignees = await loadAllRegionEmployeeAssigneeOptions(supabase, {
      excludeQc: true,
      vehicleDriversOnly: false,
    });
  } else if (employee) {
    const pmCtx = {
      id: employee.id,
      region_id: employee.region_id,
      project_id: employee.project_id,
    };
    const assetsRegionOr =
      allowedRegionIds.length > 0
        ? `assigned_region_id.is.null,assigned_region_id.in.(${allowedRegionIds.join(",")})`
        : "assigned_region_id.is.null";

    const { data: catalogRows } = await supabase
      .from("assets")
      .select("id, name, category, model, serial, imei_1, imei_2, status, assigned_to_employee_id")
      .eq("is_ehs_tool", false)
      .or(assetsRegionOr)
      .order("name");
    searchCatalog = await attachAssigneeNames(catalogRows ?? []);
    assets = searchCatalog.filter((a) => a.status === "Available");
    assignees = await loadPmRegionEmployeeOptions(supabase, pmCtx, session.user.id, {
      excludeQc: true,
      vehicleDriversOnly: false,
    });
  }

  let ehsAssetsQuery = supabase
    .from("assets")
    .select("id, asset_id, name, status, ehs_tool_type, en_code, assigned_region_id")
    .eq("is_ehs_tool", true)
    .eq("status", "Available")
    .is("assigned_to_employee_id", null)
    .order("asset_id");

  if (isPm && allowedRegionIds.length > 0) {
    const orParts = [...allowedRegionIds.map((id) => `assigned_region_id.eq.${id}`), "assigned_region_id.is.null"];
    ehsAssetsQuery = ehsAssetsQuery.or(orParts.join(","));
  }

  const { data: ehsAssets } = await ehsAssetsQuery;

  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id, role")
    .in("role", ["Driver/Rigger", "Self DT"]);
  const driverIds = [...new Set((roleRows ?? []).map((r) => r.employee_id as string))];

  let driversQuery = supabase
    .from("employees")
    .select("id, full_name, email, region_id, status")
    .in("id", driverIds.length ? driverIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "ACTIVE")
    .order("full_name");

  if (isPm && allowedRegionIds.length > 0) {
    driversQuery = driversQuery.in("region_id", allowedRegionIds);
  }

  const { data: driverEmps } = await driversQuery;
  const drivers = (driverEmps ?? []).map((e) => ({
    id: e.id as string,
    full_name: ((e.full_name as string | null) ?? (e.email as string | null) ?? "Driver/Rigger").trim(),
    region_id: (e.region_id as string | null) ?? null,
  }));

  const viewerRole = isPortalAdmin ? "admin" : "pm";

  return (
    <div className="space-y-5">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        {viewerRole === "pm" ? (
          <>
            <Link href="/dashboard/assets" className="hover:text-zinc-900">
              Assets
            </Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span className="text-zinc-900">Assign</span>
      </nav>
      <div
        className={`rounded-2xl border p-5 sm:p-6 ${
          tab === "ehs"
            ? "border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50"
            : "border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50"
        }`}
      >
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Assign assets & EHS tools</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {tab === "ehs"
              ? "Assign EHS tools directly to a Driver/Rigger. Receipt confirmation sits with that employee."
              : viewerRole === "admin"
                ? "Assign fleet assets to an eligible employee by region (QC excluded)."
                : "Assign fleet assets to active employees in your regions (QC excluded)."}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            {tab === "ehs"
              ? `Driver/Riggers: ${drivers.length} · Available EHS: ${(ehsAssets ?? []).length}`
              : `Eligible: ${assignees.length} · Available fleet: ${assets.length}`}
          </span>
          {viewerRole === "pm" ? (
            <Link
              href="/dashboard/assets"
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← Back to assets
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← Dashboard
            </Link>
          )}
        </div>
      </div>

      <FleetEhsSectionTabs
        activeTab={tab}
        basePath="/dashboard/assets/assign"
        fleetCount={assets.length}
        ehsCount={(ehsAssets ?? []).length}
      />

      <div className="rounded-b-xl border border-t-0 border-zinc-200 bg-white p-4 sm:p-6">
        {tab === "fleet" ? (
          <PmAssignToEmployeeClient
            assets={assets ?? []}
            searchCatalog={searchCatalog}
            assignees={assignees}
            viewerRole={viewerRole}
          />
        ) : (
          <PmAssignEhsToolsClient assets={ehsAssets ?? []} drivers={drivers} />
        )}
      </div>
    </div>
  );
}
