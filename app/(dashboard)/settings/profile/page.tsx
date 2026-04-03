import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { EmployeeProfileSettings } from "@/components/profile/EmployeeProfileSettings";

export default async function EmployeeProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.email) redirect("/login");

  const email = session.user.email.trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const client = admin ?? supabase;

  const { data: employee } = await client
    .from("employees")
    .select("id, full_name, phone, accommodations, status, avatar_url")
    .eq("email", email)
    .maybeSingle();
  const { data: userProfile } = await client
    .from("users_profile")
    .select("id, full_name, status, avatar_url")
    .eq("email", email)
    .maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;

  if (!isEmployee && !isAdminView) {
    redirect("/login?error=" + encodeURIComponent("No active employee or admin account."));
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Profile settings</h1>
      <p className="mb-8 text-sm text-slate-600">
        Update your profile photo, contact details, and password for the employee portal.
      </p>
      {isAdminView ? (
        <EmployeeProfileSettings
          mode="admin_view"
          initialFullName={userProfile?.full_name ?? null}
          email={session.user.email}
          initialAvatarUrl={userProfile?.avatar_url ?? null}
        />
      ) : (
        <EmployeeProfileSettings
          mode="employee"
          initialFullName={employee?.full_name ?? ""}
          initialPhone={employee?.phone ?? ""}
          initialAccommodations={employee?.accommodations ?? ""}
          email={session.user.email}
          initialAvatarUrl={employee?.avatar_url ?? null}
        />
      )}
    </div>
  );
}
