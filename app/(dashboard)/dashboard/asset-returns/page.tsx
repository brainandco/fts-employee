import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PmAssetReturnsQueue } from "@/components/assets/PmAssetReturnsQueue";

export default async function PmAssetReturnsPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: employee } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!employee) redirect("/login");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  const isQc = (roles ?? []).some((r) => r.role === "QC");
  if (!isPm && !isQc) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Asset returns</span>
      </nav>
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Asset return queue</h1>
        <p className="fts-page-desc max-w-3xl">
          {isPm ? (
            <>
              Employees in your region submit returns with a comment. Review and set final status as <strong>Available</strong>,{" "}
              <strong>Under maintenance</strong>, or <strong>Damaged</strong>. Comments are required for maintenance or damage.
            </>
          ) : (
            <>
              Pending returns in your region. <strong>QC</strong> can review handover details here; the <strong>Project Manager</strong> applies the
              final asset status (Available, Under maintenance, or Damaged).
            </>
          )}
        </p>
      </div>
      <PmAssetReturnsQueue canProcess={isPm} />
    </div>
  );
}
