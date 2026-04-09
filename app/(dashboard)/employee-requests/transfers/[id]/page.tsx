import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";

function typeLabel(t: string): string {
  return t.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function canViewTransfer(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  userId: string,
  email: string,
  transfer: { requester_employee_id: string; requester_region_id: string }
): Promise<boolean> {
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) return false;
  if (transfer.requester_employee_id === employee.id) return true;

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const canReview = roleSet.has("QC") || roleSet.has("Project Manager");
  if (!canReview) return false;

  if (roleSet.has("Project Manager")) {
    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      userId
    );
    if (allowedRegionIds.length === 0) return false;
    return allowedRegionIds.includes(transfer.requester_region_id);
  }

  return employee.region_id === transfer.requester_region_id;
}

export default async function EmployeeTransferRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user) redirect("/login");

  const supabase = await getDataClient();
  const { data: t } = await supabase.from("transfer_requests").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();

  const email = (session.user.email ?? "").trim().toLowerCase();
  const allowed = await canViewTransfer(supabase, session.user.id, email, {
    requester_employee_id: t.requester_employee_id,
    requester_region_id: t.requester_region_id,
  });
  if (!allowed) redirect("/dashboard/transfer-requests");

  const empIds = [
    t.requester_employee_id,
    t.target_employee_id,
    t.reviewed_by_employee_id,
  ].filter(Boolean) as string[];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", [...new Set(empIds)])
    : { data: [] };
  const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name ?? ""]));

  const { data: region } = t.requester_region_id
    ? await supabase.from("regions").select("name").eq("id", t.requester_region_id).maybeSingle()
    : { data: null };

  let assetLabel: string | null = null;
  if (t.asset_id) {
    const { data: asset } = await supabase.from("assets").select("name, asset_id").eq("id", t.asset_id).maybeSingle();
    assetLabel = asset ? [asset.name, asset.asset_id].filter(Boolean).join(" · ") || t.asset_id : t.asset_id;
  }

  const handoverUrls = Array.isArray(t.handover_image_urls) ? (t.handover_image_urls as string[]) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/dashboard/transfer-requests" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Transfer requests
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900">{typeLabel(t.request_type)}</h1>
        <span className="rounded bg-zinc-200 px-2 py-0.5 text-sm text-zinc-700">{t.status}</span>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Requester</dt>
            <dd>{empMap.get(t.requester_employee_id) || t.requester_employee_id}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Region</dt>
            <dd>{region?.name ?? t.requester_region_id}</dd>
          </div>
          {t.target_employee_id ? (
            <div>
              <dt className="text-zinc-500">Target employee</dt>
              <dd>{empMap.get(t.target_employee_id) || t.target_employee_id}</dd>
            </div>
          ) : null}
          {assetLabel ? (
            <div>
              <dt className="text-zinc-500">Asset</dt>
              <dd>{assetLabel}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500">Reason</dt>
            <dd className="whitespace-pre-wrap">{t.request_reason}</dd>
          </div>
          {t.notes ? (
            <div>
              <dt className="text-zinc-500">Notes</dt>
              <dd className="whitespace-pre-wrap">{t.notes}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500">Submitted</dt>
            <dd>{new Date(t.created_at).toLocaleString()}</dd>
          </div>
          {t.reviewed_at ? (
            <div>
              <dt className="text-zinc-500">Reviewed</dt>
              <dd>
                {new Date(t.reviewed_at).toLocaleString()}
                {t.reviewed_by_employee_id ? (
                  <span className="text-zinc-600">
                    {" "}
                    · {empMap.get(t.reviewed_by_employee_id) || t.reviewed_by_employee_id}
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {t.reviewer_comment ? (
            <div>
              <dt className="text-zinc-500">Reviewer comment</dt>
              <dd className="whitespace-pre-wrap">{t.reviewer_comment}</dd>
            </div>
          ) : null}
          {t.payload_json && typeof t.payload_json === "object" && Object.keys(t.payload_json as object).length > 0 ? (
            <div>
              <dt className="text-zinc-500">Extra details</dt>
              <dd>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-zinc-100 p-3 text-xs">
                  {JSON.stringify(t.payload_json, null, 2)}
                </pre>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {handoverUrls.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-medium text-zinc-900">Handover photos</h2>
          <ul className="flex flex-wrap gap-3">
            {handoverUrls.map((url) => (
              <li key={url} className="w-40">
                <a href={url} target="_blank" rel="noopener noreferrer" className="block text-xs text-indigo-600 hover:underline">
                  <img src={url} alt="" className="h-32 w-full rounded border border-zinc-200 object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-zinc-600">
        Use <Link href="/dashboard/transfer-requests" className="font-medium text-indigo-600 hover:text-indigo-800">Transfer requests</Link>{" "}
        to accept or reject when you are a reviewer.
      </p>
    </div>
  );
}
