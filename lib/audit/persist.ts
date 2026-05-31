import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditPersistRow = {
  actor_user_id: string | null;
  actor_email: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  old_value_json?: Record<string, unknown> | null;
  new_value_json?: Record<string, unknown> | null;
  description: string | null;
  meta?: Record<string, unknown> | null;
  portal?: string | null;
  route_path?: string | null;
  http_method?: string | null;
  status_code?: number | null;
  action_category?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

function isMissingColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("column") || m.includes("schema cache") || m.includes("could not find");
}

export async function persistAuditRow(db: SupabaseClient, row: AuditPersistRow): Promise<boolean> {
  const fullRow = {
    ...row,
    portal: row.portal ?? "employee",
    old_value_json: row.old_value_json ?? null,
    new_value_json: row.new_value_json ?? null,
    meta: row.meta ?? null,
  };

  const { error } = await db.from("audit_logs").insert(fullRow);
  if (!error) return true;

  const meta: Record<string, unknown> = {
    ...(row.meta ?? {}),
    _audit_v2: {
      portal: row.portal ?? "employee",
      action_category: row.action_category,
      route_path: row.route_path,
      http_method: row.http_method,
    },
  };

  const { error: legacyError } = await db.from("audit_logs").insert({
    actor_user_id: row.actor_user_id,
    actor_email: row.actor_email,
    action_type: row.action_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    old_value_json: row.old_value_json ?? null,
    new_value_json: row.new_value_json ?? null,
    description: row.description,
    meta,
    ip_address: row.ip_address ?? null,
    user_agent: row.user_agent ?? null,
  });

  if (legacyError) {
    console.error("[audit] persist failed:", legacyError.message);
    return false;
  }
  if (isMissingColumnError(error.message)) {
    console.warn("[audit] stored via legacy columns");
  }
  return true;
}
