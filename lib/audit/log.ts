import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import type { AuditActionCategory, AuditLogInput } from "@/lib/audit/types";

export type { AuditLogInput };

function clientIp(req?: Request | null): string | null {
  if (!req) return null;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

function clientUserAgent(req?: Request | null): string | null {
  return req?.headers.get("user-agent") ?? null;
}

async function getAuditDb() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServerSupabaseAdmin();
  }
  return createServerSupabaseClient();
}

export async function resolveActor(req?: Request | null): Promise<{ userId: string | null; email: string | null }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null };

  const { data: emp } = await supabase.from("employees").select("email").eq("auth_user_id", user.id).maybeSingle();
  return { userId: user.id, email: emp?.email ?? user.email ?? null };
}

export async function auditLog(params: AuditLogInput & { req?: Request | null }) {
  const { req, ...rest } = params;
  const actor =
    rest.actorUserId !== undefined || rest.actorEmail !== undefined
      ? { userId: rest.actorUserId ?? null, email: rest.actorEmail ?? null }
      : await resolveActor(req);

  const row = {
    actor_user_id: actor.userId,
    actor_email: actor.email,
    action_type: rest.actionType,
    entity_type: rest.entityType,
    entity_id: rest.entityId ?? null,
    old_value_json: rest.oldValue ?? null,
    new_value_json: rest.newValue ?? null,
    description: rest.description ?? null,
    meta: rest.meta ?? null,
    portal: rest.portal ?? "employee",
    route_path: rest.routePath ?? null,
    http_method: rest.httpMethod ?? null,
    status_code: rest.statusCode ?? null,
    action_category: rest.actionCategory ?? inferCategory(rest.actionType),
    ip_address: rest.ipAddress ?? clientIp(req) ?? null,
    user_agent: rest.userAgent ?? clientUserAgent(req) ?? null,
  };

  try {
    const db = await getAuditDb();
    await db.from("audit_logs").insert(row);
  } catch (e) {
    console.error("[audit] insert failed:", e);
  }
}

export function inferCategory(actionType: string): AuditActionCategory {
  const a = actionType.toLowerCase();
  if (a.includes("login") || a.includes("logout") || a.includes("auth")) return "auth";
  if (a.includes("upload") || a.includes("download") || a.includes("presign") || a.includes("file")) return "file";
  if (a.includes("assign") || a.includes("return") || a.includes("receipt")) return "assignment";
  if (a.includes("approv") || a.includes("leave")) return "approval";
  if (a === "api_access") return "api";
  if (a.includes("create") || a.includes("update") || a.includes("delete")) return "data";
  return "system";
}

export async function auditLogFromRequest(req: Request, params: Omit<AuditLogInput, "routePath" | "httpMethod" | "ipAddress" | "userAgent">) {
  const url = new URL(req.url);
  await auditLog({
    ...params,
    req,
    portal: "employee",
    routePath: url.pathname,
    httpMethod: req.method,
  });
}
