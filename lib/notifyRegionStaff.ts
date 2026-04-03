import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Notify all PMs and QCs in a region (by users_profile id).
 */
export async function notifyPmAndQcInRegion(
  supabase: SupabaseClient,
  regionId: string,
  payload: NotifyPayload
): Promise<void> {
  const { data: pmRows } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role", "Project Manager");
  const { data: qcRows } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role", "QC");

  const pmIds = new Set((pmRows ?? []).map((r) => r.employee_id));
  const qcIds = new Set((qcRows ?? []).map((r) => r.employee_id));
  const staffIds = [...new Set([...pmIds, ...qcIds])];
  if (staffIds.length === 0) return;

  const { data: staffEmps } = await supabase
    .from("employees")
    .select("id, email")
    .in("id", staffIds)
    .eq("region_id", regionId);

  const emails = (staffEmps ?? []).map((e) => e.email).filter(Boolean) as string[];
  if (emails.length === 0) return;

  const emailToEmpId = new Map<string, string>();
  for (const e of staffEmps ?? []) {
    const em = (e.email ?? "").trim().toLowerCase();
    if (em) emailToEmpId.set(em, e.id);
  }

  const { data: profiles } = await supabase.from("users_profile").select("id, email").in("email", emails);
  const notifications = (profiles ?? []).map((p) => ({
    recipient_user_id: p.id,
    title: payload.title,
    body: payload.body,
    category: payload.category,
    link: resolveNotifyLink(p.email, emailToEmpId, pmIds, qcIds, payload),
    meta: (payload.meta ?? {}) as object,
  }));
  if (notifications.length > 0) {
    await supabase.from("notifications").insert(notifications);
  }
}
