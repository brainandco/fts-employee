import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { resolveEmployeeFileAccess } from "@/lib/employee-files/access";
import { MyFilesClient } from "./MyFilesClient";

export default async function MyFilesPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { employee, canView } = await resolveEmployeeFileAccess(supabase, email);

  if (!employee || employee.status !== "ACTIVE") redirect("/dashboard");

  const hasRegion = !!employee.region_id;
  const { data: folder } = hasRegion
    ? await supabase
        .from("employee_file_region_folders")
        .select("id")
        .eq("region_id", employee.region_id as string)
        .maybeSingle()
    : { data: null };

  const hasRegionFolder = !!folder;

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">My files</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">My files</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Upload your work files to secure cloud storage under your region. Project Managers, PP, and Team Leads can
          view and manage their own uploaded files; other employees can upload only.
        </p>
      </div>
      <MyFilesClient hasRegion={hasRegion} hasRegionFolder={hasRegionFolder} canView={canView} />
    </div>
  );
}
