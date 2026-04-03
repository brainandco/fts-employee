import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return null;

  const supabase = await getDataClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, created_at, closed_at")
    .eq("id", id)
    .eq("assigned_to_user_id", session.user.id)
    .single();

  if (!task) notFound();

  const { data: comments } = await supabase
    .from("task_comments")
    .select("id, body, created_at, user_id")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  const currentUserId = session.user.id;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/tasks" className="hover:text-zinc-900">My tasks</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900 truncate">{task.title}</span>
      </nav>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-zinc-900">{task.title}</h1>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              task.status === "Completed" || task.status === "Closed"
                ? "bg-emerald-100 text-emerald-800"
                : task.status === "In_Progress"
                ? "bg-blue-100 text-blue-800"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {task.status.replace(/_/g, " ")}
          </span>
          {task.due_date && <span className="text-sm text-zinc-500">Due: {task.due_date}</span>}
        </div>
        {task.description && (
          <div className="mt-4 prose prose-sm max-w-none text-zinc-700">
            <p className="whitespace-pre-wrap">{task.description}</p>
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-500">Created: {new Date(task.created_at).toLocaleString()}</p>
        {task.closed_at && (
          <p className="text-xs text-zinc-500">Closed: {new Date(task.closed_at).toLocaleString()}</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Comments</h2>
        {!comments?.length ? (
          <p className="mt-2 text-sm text-zinc-500">No comments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="border-l-2 border-zinc-200 pl-3">
                <p className="text-sm text-zinc-700">{c.body}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {c.user_id === currentUserId ? "You" : "Team"} · {new Date(c.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
