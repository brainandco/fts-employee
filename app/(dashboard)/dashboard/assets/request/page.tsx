import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RequestAssetForm } from "./RequestAssetForm";

export default async function RequestAssetPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("email", session.user.email ?? "")
    .maybeSingle();
  if (!employee) redirect("/login");

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <Link href="/dashboard/assets" className="hover:text-zinc-900">Assets</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Request asset</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-slate-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Request asset from admin</h1>
        <p className="mt-1 text-sm text-zinc-700">
          PM cannot add assets directly. Your request is reviewed by Admin first, then finalized by a Super User—same stages as leave requests. After final approval, assign from available stock when the items exist.
        </p>
      </div>
      <RequestAssetForm />
    </div>
  );
}
