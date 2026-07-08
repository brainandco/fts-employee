import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAssetReceiptStatusMap, loadSimReceiptStatusMap } from "@/lib/assets/asset-receipt-status";
import { loadPmRegionEmployeeOptions, loadPmScopeIds, type PmContext } from "@/lib/pm-team-assignees";

export type PmAssigneeOption = { id: string; label: string };

export type PmAssetCatalogRow = {
  id: string;
  name: string | null;
  category: string | null;
  model: string | null;
  serial: string | null;
  imei_1: string | null;
  imei_2: string | null;
  status: string;
  assigned_to_employee_id?: string | null;
  assigneeName: string | null;
};

export type PmSimPoolRow = {
  id: string;
  operator: string | null;
  service_type: string | null;
  sim_number: string | null;
  phone_number: string | null;
  status: string;
};

export type PmVehiclePoolRow = {
  id: string;
  plate_number: string | null;
  vehicle_type: string | null;
  rent_company: string | null;
  make: string | null;
  model: string | null;
  status: string;
};

export type PmWhoHasAssetLine = {
  id: string;
  name: string | null;
  model: string | null;
  serial: string | null;
  category: string | null;
  status: string;
  receiptStatus: "pending" | "confirmed" | null;
};

export type PmWhoHasSimLine = {
  id: string;
  sim_number: string | null;
  phone_number: string | null;
  operator: string | null;
  service_type: string | null;
  status: string;
  receiptStatus: "pending" | "confirmed" | null;
};

export type PmWhoHasEmployee = {
  id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  assets: PmWhoHasAssetLine[];
  sims: PmWhoHasSimLine[];
};

async function attachAssigneeNames(
  supabase: SupabaseClient,
  rows: {
    id: string;
    name: string | null;
    category: string | null;
    model: string | null;
    serial: string | null;
    imei_1: string | null;
    imei_2: string | null;
    status: string;
    assigned_to_employee_id?: string | null;
  }[]
): Promise<PmAssetCatalogRow[]> {
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

export async function loadPmAssignAssetsData(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string
): Promise<{ assets: PmAssetCatalogRow[]; searchCatalog: PmAssetCatalogRow[]; assignees: PmAssigneeOption[] }> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pm, authUserId);
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

  const searchCatalog = await attachAssigneeNames(supabase, catalogRows ?? []);
  const assets = searchCatalog.filter((a) => a.status === "Available");
  const assignees = await loadPmRegionEmployeeOptions(supabase, pm, authUserId, {
    excludeQc: true,
    vehicleDriversOnly: false,
  });

  return { assets, searchCatalog, assignees };
}

export async function loadPmAssignSimsData(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string
): Promise<{ sims: PmSimPoolRow[]; assignees: PmAssigneeOption[] }> {
  const { data: sims } = await supabase
    .from("sim_cards")
    .select("id, operator, service_type, sim_number, phone_number, status")
    .eq("status", "Available")
    .order("sim_number");

  const assignees = await loadPmRegionEmployeeOptions(supabase, pm, authUserId, {
    excludeQc: true,
    vehicleDriversOnly: false,
  });

  return { sims: (sims ?? []) as PmSimPoolRow[], assignees };
}

export async function loadPmAssignVehiclesData(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string
): Promise<{ vehicles: PmVehiclePoolRow[]; assignees: PmAssigneeOption[] }> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pm, authUserId);
  const vehiclesRegionOr =
    allowedRegionIds.length > 0
      ? `assigned_region_id.is.null,assigned_region_id.in.(${allowedRegionIds.join(",")})`
      : "assigned_region_id.is.null";

  const regionCandidates = await loadPmRegionEmployeeOptions(supabase, pm, authUserId, {
    excludeQc: false,
    vehicleDriversOnly: true,
  });

  const { data: candidates } = await supabase
    .from("vehicles")
    .select("id, plate_number, vehicle_type, rent_company, make, model, assigned_region_id, status")
    .eq("status", "Available")
    .or(vehiclesRegionOr)
    .order("plate_number");

  const vehicleIds = (candidates ?? []).map((v) => v.id);
  const { data: assignedRows } = vehicleIds.length
    ? await supabase.from("vehicle_assignments").select("vehicle_id").in("vehicle_id", vehicleIds)
    : { data: [] };
  const assignedSet = new Set((assignedRows ?? []).map((r) => r.vehicle_id));
  const vehicles = (candidates ?? []).filter((v) => !assignedSet.has(v.id)) as PmVehiclePoolRow[];

  const regionIds = regionCandidates.map((a) => a.id);
  const { data: empAssignments } = regionIds.length
    ? await supabase.from("vehicle_assignments").select("employee_id").in("employee_id", regionIds)
    : { data: [] };
  const occupiedEmpSet = new Set((empAssignments ?? []).map((r) => r.employee_id));
  const assignees = regionCandidates.filter((a) => !occupiedEmpSet.has(a.id));

  return { vehicles, assignees };
}

export async function loadPmWhoHasAssetsData(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string
): Promise<{ scopeLabel: string; employees: PmWhoHasEmployee[]; withoutCount: number }> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pm, authUserId);

  let scopeLabel = "No region scope";
  if (allowedRegionIds.length === 1) {
    const { data: regionRow } = await supabase
      .from("regions")
      .select("name, code")
      .eq("id", allowedRegionIds[0]!)
      .maybeSingle();
    scopeLabel = `${regionRow?.name ?? "—"}${regionRow?.code ? ` · ${regionRow.code}` : ""}`;
  } else if (allowedRegionIds.length > 1) {
    scopeLabel = `${allowedRegionIds.length} regions`;
  }

  if (allowedRegionIds.length === 0) {
    return { scopeLabel, employees: [], withoutCount: 0 };
  }

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id, full_name, email")
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE")
    .order("full_name");

  const empIds = (regionEmps ?? []).map((e) => e.id);
  const { data: allRoles } = empIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", empIds)
    : { data: [] };

  const rolesByEmp = new Map<string, string[]>();
  for (const r of allRoles ?? []) {
    const arr = rolesByEmp.get(r.employee_id) ?? [];
    arr.push(r.role);
    rolesByEmp.set(r.employee_id, arr);
  }

  const { data: assignedAssets } = empIds.length
    ? await supabase
        .from("assets")
        .select("id, name, model, serial, category, status, assigned_to_employee_id")
        .eq("is_ehs_tool", false)
        .in("assigned_to_employee_id", empIds)
        .in("status", ["Assigned", "Under_Maintenance", "Damaged", "With_QC"])
        .order("name")
    : { data: [] };

  const assetsByEmp = new Map<string, PmWhoHasAssetLine[]>();
  for (const a of assignedAssets ?? []) {
    const eid = a.assigned_to_employee_id;
    if (!eid) continue;
    const list = assetsByEmp.get(eid) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      model: a.model,
      serial: a.serial,
      category: a.category,
      status: a.status,
      receiptStatus: null,
    });
    assetsByEmp.set(eid, list);
  }

  const assetIds = [...new Set((assignedAssets ?? []).map((a) => a.id))];
  const receiptMap = await loadAssetReceiptStatusMap(supabase, empIds, assetIds);
  for (const [eid, lines] of assetsByEmp) {
    assetsByEmp.set(
      eid,
      lines.map((line) => ({
        ...line,
        receiptStatus: receiptMap.get(`${eid}:${line.id}`) ?? null,
      }))
    );
  }

  const { data: assignedSims } = empIds.length
    ? await supabase
        .from("sim_cards")
        .select("id, sim_number, phone_number, operator, service_type, status, assigned_to_employee_id")
        .in("assigned_to_employee_id", empIds)
        .eq("status", "Assigned")
        .order("sim_number")
    : { data: [] };

  const simsByEmp = new Map<string, PmWhoHasSimLine[]>();
  for (const s of assignedSims ?? []) {
    const eid = s.assigned_to_employee_id;
    if (!eid) continue;
    const list = simsByEmp.get(eid) ?? [];
    list.push({
      id: s.id,
      sim_number: s.sim_number,
      phone_number: s.phone_number,
      operator: s.operator,
      service_type: s.service_type,
      status: s.status,
      receiptStatus: null,
    });
    simsByEmp.set(eid, list);
  }

  const simIds = [...new Set((assignedSims ?? []).map((s) => s.id))];
  const simReceiptMap = await loadSimReceiptStatusMap(supabase, empIds, simIds);
  for (const [eid, lines] of simsByEmp) {
    simsByEmp.set(
      eid,
      lines.map((line) => ({
        ...line,
        receiptStatus: simReceiptMap.get(`${eid}:${line.id}`) ?? null,
      }))
    );
  }

  const employees: PmWhoHasEmployee[] = (regionEmps ?? [])
    .filter((e) => (assetsByEmp.get(e.id)?.length ?? 0) > 0 || (simsByEmp.get(e.id)?.length ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      full_name: e.full_name ?? "—",
      email: e.email,
      roles: rolesByEmp.get(e.id) ?? [],
      assets: assetsByEmp.get(e.id) ?? [],
      sims: simsByEmp.get(e.id) ?? [],
    }));

  const withoutCount = (regionEmps ?? []).length - employees.length;

  return { scopeLabel, employees, withoutCount };
}

export async function loadPmAvailableReplacementAssets(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string
): Promise<{ id: string; name: string | null; serial: string | null; category: string | null }[]> {
  const { assets } = await loadPmAssignAssetsData(supabase, pm, authUserId);
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    serial: a.serial,
    category: a.category,
  }));
}
