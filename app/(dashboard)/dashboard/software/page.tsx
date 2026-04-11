import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SoftwareLibraryClient } from "./SoftwareLibraryClient";

export default async function EmployeeSoftwarePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const dataClient = await getDataClient();
  const { data: items } = await dataClient
    .from("portal_software")
    .select("id, title, description, file_name, mime_type, byte_size, created_at")
    .eq("upload_status", "active")
    .order("title", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Software library</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Download approved tools and installers published by your administrators. Links are temporary and secure.
        </p>
        <Link href="/dashboard" className="mt-3 inline-block text-sm text-teal-800 hover:underline">
          ← Dashboard
        </Link>
      </div>
      <SoftwareLibraryClient initialItems={items ?? []} />
    </div>
  );
}
