import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";

type NotifyPayload = {
  title: string;
  body: string;
  category: string;
  /** Default when `linkByRole` does not apply. */
  link?: string;
  /** Per-role deep links (PM vehicle pool vs QC roster, etc.). */
  linkByRole?: { pm?: string; qc?: string };
  meta?: Record<string, unknown>;
};

function resolveNotifyLink(
  profileEmail: string | null | undefined,
  emailToEmpId: Map<string, string>,
  pmIds: Set<string>,
  qcIds: Set<string>,
  payload: NotifyPayload
): string | null {
  const key = (profileEmail ?? "").trim().toLowerCase();
  const empId = key ? emailToEmpId.get(key) : undefined;
  const br = payload.linkByRole;
  if (empId && br) {
    if (pmIds.has(empId) && br.pm) return br.pm;
    if (qcIds.has(empId) && br.qc) return br.qc;
  }
  return payload.link ?? null;
}

export type PmQcNotifyContext = {
  /** Only users tied to this project (PM on project, PM assignments, QCs in region for this project) are notified. */
  projectId: string;
};

/**
 * Notifies only staff **involved with the given project** — never every PM/QC in the region.
 * - Project portal PM (`projects.pm_user_id`)
 * - PM employees on `pm_employee_projects` or with primary `employees.project_id`
 * - QC employees in `regionId` whose `project_id` is null or matches `projectId`
 *
 * If `context` is missing or has no `projectId`, **no rows are inserted** (avoid unrelated employees).
 */
export async function notifyPmAndQcInRegion(
  supabase: SupabaseClient,
  regionId: string,
  payload: NotifyPayload,
  context?: PmQcNotifyContext
): Promise<void> {
  const projectId = context?.projectId?.trim();
  if (!projectId) return;

  const { data: pmRoleRows } = await supabase.from("employee_roles").select("employee_id").eq("role", "Project Manager");
  const { data: qcRoleRows } = await supabase.from("employee_roles").select("employee_id").eq("role", "QC");
  const pmIds = new Set((pmRoleRows ?? []).map((r) => r.employee_id));
  const qcIds = new Set((qcRoleRows ?? []).map((r) => r.employee_id));

  const emailToEmpId = new Map<string, string>();
  const recipientUserIds = new Set<string>();

  const { data: proj } = await supabase.from("projects").select("pm_user_id").eq("id", projectId).maybeSingle();
  const pmAuthId = proj?.pm_user_id as string | undefined;
  if (pmAuthId) {
    const { data: pu } = await supabase
      .from("users_profile")
      .select("id")
      .eq("id", pmAuthId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (pu?.id) recipientUserIds.add(pu.id);
  }

  const { data: junctionRows } = await supabase.from("pm_employee_projects").select("employee_id").eq("project_id", projectId);
  const junctionPmIds = [...new Set((junctionRows ?? []).map((r) => r.employee_id))].filter((id) => pmIds.has(id));

  const pmIdList = [...pmIds];
  const { data: pmPrimaryRows } = pmIdList.length
    ? await supabase.from("employees").select("id, email").eq("project_id", projectId).in("id", pmIdList)
    : { data: [] };

  const pmEmpById = new Map<string, { id: string; email: string | null }>();
  for (const r of pmPrimaryRows ?? []) {
    if (r.id) pmEmpById.set(r.id, r);
  }
  if (junctionPmIds.length) {
    const { data: jEmps } = await supabase.from("employees").select("id, email").in("id", junctionPmIds);
    for (const r of jEmps ?? []) {
      if (r.id && !pmEmpById.has(r.id)) pmEmpById.set(r.id, r);
    }
  }
  for (const row of pmEmpById.values()) {
    const em = (row.email ?? "").trim().toLowerCase();
    if (em) emailToEmpId.set(em, row.id);
  }

  const qcIdList = [...qcIds];
  const { data: qcEmps } = qcIdList.length
    ? await supabase.from("employees").select("id, email, project_id").in("id", qcIdList).eq("region_id", regionId)
    : { data: [] };

  for (const row of qcEmps ?? []) {
    if (row.project_id && row.project_id !== projectId) continue;
    const em = (row.email ?? "").trim().toLowerCase();
    if (em) emailToEmpId.set(em, row.id);
  }

  const emails = [...emailToEmpId.keys()];
  if (emails.length) {
    const { data: profiles } = await supabase
      .from("users_profile")
      .select("id, email")
      .in("email", emails)
      .eq("status", "ACTIVE")
      .eq("employee_portal_only", true);
    for (const p of profiles ?? []) {
      if (p.id) recipientUserIds.add(p.id);
    }
  }

  if (recipientUserIds.size === 0) return;

  const { data: recipientProfiles } = await supabase
    .from("users_profile")
    .select("id, email")
    .in("id", [...recipientUserIds])
    .eq("status", "ACTIVE");

  const notifications = (recipientProfiles ?? []).map((p) => ({
    recipient_user_id: p.id,
    title: payload.title,
    body: payload.body,
    category: payload.category,
    link: resolveNotifyLink(p.email, emailToEmpId, pmIds, qcIds, payload),
    meta: (payload.meta ?? {}) as object,
  }));

  if (notifications.length > 0) {
    await dispatchNotifications(supabase, notifications);
  }
}
