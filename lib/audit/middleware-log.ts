import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { inferFromApiRoute, shouldLogApiMethod, shouldSkipApiAudit } from "@/lib/audit/infer-route";
import { persistAuditRow } from "@/lib/audit/persist";
import { getSupabaseProjectUrl } from "@/lib/supabase/public-env";

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

async function resolveActorFromRequest(request: NextRequest): Promise<{ userId: string | null; email: string | null }> {
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { getSupabaseUrlAndAnonKey } = await import("@/lib/supabase/public-env");
    const env = getSupabaseUrlAndAnonKey();
    if (!env) return { userId: null, email: null };

    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { userId: null, email: null };
    return { userId: user.id, email: user.email ?? null };
  } catch {
    return { userId: null, email: null };
  }
}

export async function logApiRequestMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || shouldSkipApiAudit(pathname)) return;
  if (!shouldLogApiMethod(request.method, pathname)) return;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = getSupabaseProjectUrl();
  if (!url || !serviceKey) return;

  const method = request.method.toUpperCase();
  const inferred = inferFromApiRoute(method, pathname);
  const actor = await resolveActorFromRequest(request);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await persistAuditRow(supabase, {
    actor_user_id: actor.userId,
    actor_email: actor.email,
    action_type: inferred.actionType,
    entity_type: inferred.entityType,
    entity_id: null,
    description: inferred.description,
    portal: "employee",
    route_path: pathname,
    http_method: method,
    action_category: inferred.actionCategory,
    ip_address: clientIp(request),
    user_agent: request.headers.get("user-agent"),
    meta: { query: Object.fromEntries(request.nextUrl.searchParams.entries()), source: "middleware" },
  });
}
