import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  let session;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    redirect("/portal-unavailable");
  }

  if (session) {
    const access = await resolveEmployeePortalAccess(session);
    if (access.kind === "employee" || access.kind === "admin_view") {
      redirect("/dashboard");
    }
    if (access.reason === "misconfigured") {
      redirect("/portal-unavailable");
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
