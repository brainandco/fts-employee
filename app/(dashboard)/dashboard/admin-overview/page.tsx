import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: userProfile } = await supabase.from("users_profile").select("id, status").eq("email", email).maybeSingle();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();

  if (!userProfile || userProfile.status !== "ACTIVE" || employee) {
    redirect("/dashboard");
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, email, status, region_id, onboarding_date")
    .order("full_name");
  const regionIds = [...new Set((employees ?? []).map((e) => e.region_id).filter(Boolean))];
  const { data: regions } = regionIds.length
    ? await supabase.from("regions").select("id, name").in("id", regionIds)
    : { data: [] };
  const regionMap = new Map((regions ?? []).map((r) => [r.id, r.name]));

  return (
    <div>
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">All employees</span>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">All employees</h1>
      <p className="mb-6 text-sm text-zinc-500">Read-only list. For full history and tracking use the Admin Portal.</p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Email</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Region</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => (
              <tr key={e.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3 font-medium text-zinc-900">{e.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-600">{e.email ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-600">{e.region_id ? regionMap.get(e.region_id) ?? "—" : "—"}</td>
                <td className="px-4 py-3">{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
