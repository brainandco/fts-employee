import { redirect } from "next/navigation";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Home() {
  let session;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    redirect("/portal-unavailable");
  }

  if (!session) {
    redirect("/login");
  }

  const access = await resolveEmployeePortalAccess(session);
  if (access.kind === "employee" || access.kind === "admin_view") {
    redirect("/dashboard");
  }
  if (access.reason === "misconfigured") {
    redirect("/portal-unavailable");
  }

  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
  redirect("/login?error=" + encodeURIComponent(access.message));
}
