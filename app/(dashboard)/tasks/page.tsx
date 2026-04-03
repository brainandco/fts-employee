import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function TasksPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return null;

  const supabase = await getDataClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, created_at")
    .eq("assigned_to_user_id", session.user.id)
    .order("due_date", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">My tasks</h1>
        <p className="mt-1 text-zinc-600">Tasks assigned to you. Open a task to view details and comments.</p>
      </div>

      {!tasks?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
          No tasks assigned to you.
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tasks/${t.id}`}
                className="rounded-2xl border border-zinc-200 bg-white block p-4 hover:border-indigo-200 hover:bg-indigo-50/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">{t.title}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      t.status === "Completed" || t.status === "Closed"
                        ? "bg-emerald-100 text-emerald-800"
                        : t.status === "In_Progress"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {t.status.replace(/_/g, " ")}
                  </span>
                  {t.due_date && (
                    <span className="text-sm text-zinc-500">Due: {t.due_date}</span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{t.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
