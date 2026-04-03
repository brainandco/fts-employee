import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotificationList } from "@/components/notifications/NotificationList";

export default async function EmployeeNotificationsPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, category, is_read, created_at, link")
    .eq("recipient_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Notifications</span>
      </nav>

      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Notifications</h1>
        <p className="fts-page-desc">Your recent alerts for assignments, requests, and approvals.</p>
      </div>

      {!(notifications ?? []).length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No notifications yet.</div>
      ) : (
        <NotificationList items={notifications ?? []} />
      )}
    </div>
  );
}
