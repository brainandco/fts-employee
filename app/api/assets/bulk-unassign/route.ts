import { NextResponse } from "next/server";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit/log";
import {
  bulkUnassignAssets,
  countAssetsForBulkUnassign,
  type BulkUnassignScope,
} from "@/lib/assets/bulk-unassign";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { resolvePortalAdminAssetAssigner } from "@/lib/portal-asset-assign-auth";

const CONFIRM_PHRASE = "UNASSIGN_ALL_ASSETS";

type AuthContext =
  | { kind: "portal_admin" }
  | { kind: "pm"; allowedRegionIds: string[] };

async function resolveBulkUnassignAuth(supabase: Awaited<ReturnType<typeof getDataClient>>, session: {
  user: { id: string; email?: string | null };
}): Promise<AuthContext | NextResponse> {
  const email = (session.user.email ?? "").trim();
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, session.user.id, email);
  if (isPortalAdmin) return { kind: "portal_admin" };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id, status")
    .eq("email", email)
    .maybeSingle();
  if (!employee || employee.status !== "ACTIVE") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  if (!isPm) {
    return NextResponse.json({ message: "Only Project Manager or Admin may bulk unassign assets." }, { status: 403 });
  }

  const { allowedRegionIds } = await loadPmScopeIds(
    supabase,
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    session.user.id
  );
  return { kind: "pm", allowedRegionIds };
}

function scopeFromRequest(
  auth: AuthContext,
  params: { all_regions?: boolean; region_id?: string }
): BulkUnassignScope | NextResponse {
  const allRegions = params.all_regions === true;
  const regionId = params.region_id?.trim() ?? "";

  if (auth.kind === "portal_admin") {
    if (allRegions || !regionId) return { mode: "all" };
    return { mode: "regions", regionIds: [regionId] };
  }

  if (allRegions) {
    if (auth.allowedRegionIds.length === 0) {
      return NextResponse.json({ message: "You have no regions in scope." }, { status: 400 });
    }
    return { mode: "regions", regionIds: auth.allowedRegionIds };
  }

  if (!regionId) {
    return NextResponse.json({ message: "region_id is required unless all_regions is true." }, { status: 400 });
  }
  if (!auth.allowedRegionIds.includes(regionId)) {
    return NextResponse.json({ message: "That region is outside your PM scope." }, { status: 403 });
  }
  return { mode: "regions", regionIds: [regionId] };
}

/** GET — preview count. PM scoped to their regions; portal admin org-wide. */
export async function GET(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const auth = await resolveBulkUnassignAuth(supabase, session);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const scope = scopeFromRequest(auth, {
    all_regions: url.searchParams.get("all_regions") === "1",
    region_id: url.searchParams.get("region_id") ?? undefined,
  });
  if (scope instanceof NextResponse) return scope;

  try {
    const count = await countAssetsForBulkUnassign(supabase, scope);
    return NextResponse.json({ count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}

/** POST — bulk unassign (PM or portal admin only). */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { message: `Send confirm: "${CONFIRM_PHRASE}" in the JSON body.` },
      { status: 400 }
    );
  }

  const supabase = await getDataClient();
  const auth = await resolveBulkUnassignAuth(supabase, session);
  if (auth instanceof NextResponse) return auth;

  const scope = scopeFromRequest(auth, {
    all_regions: body.all_regions === true,
    region_id: typeof body.region_id === "string" ? body.region_id : undefined,
  });
  if (scope instanceof NextResponse) return scope;

  try {
    const { unassignedCount, assetIds } = await bulkUnassignAssets(supabase, scope);
    await auditLog({
      actionType: "update",
      entityType: "asset",
      entityId: null,
      description:
        auth.kind === "portal_admin"
          ? `Bulk unassigned ${unassignedCount} asset(s) from employee portal (admin)`
          : `Bulk unassigned ${unassignedCount} asset(s) from employee portal (PM)`,
      newValue: { scope, unassignedCount, sampleIds: assetIds.slice(0, 20) },
      actorUserId: session.user.id,
      actorEmail: session.user.email ?? null,
    });
    return NextResponse.json({ ok: true, unassignedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk unassign failed";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
