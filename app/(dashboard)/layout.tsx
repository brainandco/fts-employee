import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { CHANGE_PASSWORD_PATH, isPasswordChangeExemptPath } from "@/lib/auth/password-change-gate";
import { EmployeePortalChrome } from "@/components/layout/EmployeePortalChrome";
import type { EmployeeNavSection } from "@/components/layout/EmployeeSidebar";
import { hasReportingPortalRole } from "@/lib/pp/auth";

const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? (await import("@/lib/supabase/admin")).createServerSupabaseAdmin()
    : null;
  const client = admin ?? supabase;
  const { data: employee } = await client
    .from("employees")
    .select("id, full_name, status, region_id, avatar_url, must_change_password")
    .eq("email", email)
    .maybeSingle();
  const { data: userProfile } = await client
    .from("users_profile")
    .select("id, full_name, status, avatar_url, must_change_password, is_super_user")
    .eq("email", email)
    .maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;

  if (!isEmployee && !isAdminView) {
    await supabase.auth.signOut();
    const inactiveMsg =
      "Your employee account is inactive. Please contact your administrator to activate your account before you can access the Employee Portal.";
    const fallbackMsg = "No active employee or admin account for this sign-in. Contact your administrator.";
    const err = employee && employee.status !== "ACTIVE" ? inactiveMsg : fallbackMsg;
    redirect("/login?error=" + encodeURIComponent(err));
  }

  const dataClient = await getDataClient();
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !isPasswordChangeExemptPath(pathname)) {
    const uid = session.user.id;
    const { data: superRoleRow } = await dataClient
      .from("user_roles")
      .select("role_id")
      .eq("user_id", uid)
      .eq("role_id", SUPER_ROLE_ID)
      .maybeSingle();
    const isSuperPortal = !!userProfile?.is_super_user || !!superRoleRow;
    if (!isSuperPortal) {
      const needFromProfile = userProfile?.must_change_password === true;
      const needFromEmployee = employee?.must_change_password === true;
      if (needFromProfile || needFromEmployee) {
        redirect(CHANGE_PASSWORD_PATH);
      }
    }
  }

  let isPm = false;
  let isQc = false;
  let isPp = false;
  let isProjectCoordinator = false;
  let showTransferRequestsNav = false;
  if (employee) {
    const { data: roles } = await dataClient.from("employee_roles").select("role").eq("employee_id", employee.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    isPm = roleSet.has("Project Manager");
    isQc = roleSet.has("QC");
    isPp = hasReportingPortalRole(roles ?? []);
    isProjectCoordinator = roleSet.has("Project Coordinator");
    showTransferRequestsNav =
      isPm ||
      isQc ||
      roleSet.has("DT") ||
      roleSet.has("Junior DT") ||
      roleSet.has("Driver/Rigger") ||
      roleSet.has("Self DT");
  }

  const displayName = employee?.full_name ?? userProfile?.full_name ?? email;
  const avatarUrl = employee?.avatar_url ?? userProfile?.avatar_url ?? null;
  const roleBadge = isAdminView
    ? "Admin"
    : isPm
      ? "PM"
      : isQc
        ? "QC"
        : isPp
          ? "Reporting"
          : isProjectCoordinator
            ? "PC"
            : "Team";
  const { count: unreadNotifications } = session?.user?.id
    ? await dataClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", session.user.id)
        .eq("is_read", false)
    : { count: 0 };

  let pendingReceiptCount = 0;
  if (employee && !isAdminView) {
    const { count } = await dataClient
      .from("resource_receipt_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("status", "pending");
    pendingReceiptCount = count ?? 0;
  }

  let navSections: EmployeeNavSection[] = [];
  if (!isAdminView && employee && isPp) {
    navSections = [
      {
        label: "Files",
        items: [{ href: "/dashboard/pp-workspace", label: "Files workspace" }],
      },
      {
        label: "Account",
        items: [
          { href: "/leave", label: "Leave" },
          { href: "/settings/profile", label: "Profile settings" },
        ],
      },
    ];
  } else if (isAdminView) {
    navSections = [
      {
        label: "Admin",
        items: [
          { href: "/dashboard", label: "Admin view" },
          { href: "/dashboard/admin-overview", label: "All employees" },
          { href: "/dashboard/assets/assign", label: "Assign assets" },
          { href: "/dashboard/software", label: "Software library" },
          { href: "/settings/profile", label: "Profile settings" },
        ],
      },
    ];
  } else {
    navSections = [
      {
        label: "Overview",
        items: [
          { href: "/dashboard", label: "Dashboard" },
          {
            href: "/dashboard/receipts",
            label: pendingReceiptCount > 0 ? `Confirm receipt (${pendingReceiptCount})` : "Confirm receipt",
          },
        ],
      },
    ];
    if (isPm) {
      navSections.push({
        label: "Project manager",
        items: [
          { href: "/dashboard/region-employees-assets", label: "Who has assets" },
          { href: "/dashboard/assets/assign", label: "Assign" },
          { href: "/dashboard/sims/assign", label: "Assign SIMs" },
          { href: "/dashboard/vehicles/assign", label: "Assign vehicles" },
          { href: "/dashboard/assets/request", label: "Request asset" },
          { href: "/dashboard/requests-from-qc", label: "QC requests" },
          { href: "/dashboard/pm-files", label: "Employee files & PP reports" },
        ],
      });
    }
    if (isQc) {
      navSections.push({
        label: "QC",
        items: [
          { href: "/dashboard", label: "Manage assets" },
          { href: "/dashboard/region-employees-assets", label: "Who has assets" },
          { href: "/dashboard/asset-returns", label: "Asset returns" },
          { href: "/dashboard/qc/request-returns", label: "Request returns" },
          { href: "/dashboard/request-to-pm", label: "Request to PM" },
        ],
      });
    }
    const workspaceItems: { href: string; label: string }[] = [];
    if (showTransferRequestsNav) {
      workspaceItems.push({ href: "/dashboard/transfer-requests", label: "Transfer requests" });
    }
    workspaceItems.push(
      { href: "/dashboard/software", label: "Software library" },
      { href: "/dashboard/my-files", label: "My files" },
      { href: "/tasks", label: "My tasks" },
      { href: "/dashboard/notifications", label: "Notifications" },
      { href: "/leave", label: "Leave" },
      { href: "/settings/profile", label: "Profile settings" }
    );
    navSections.push({
      label: "Workspace",
      items: workspaceItems,
    });
  }

  return (
    <div className="fts-app-shell min-h-dvh">
      <EmployeePortalChrome
        navSections={navSections}
        displayName={displayName}
        email={session.user.email ?? null}
        avatarUrl={avatarUrl}
        roleBadge={roleBadge}
        unreadNotifications={unreadNotifications ?? 0}
        showOpenAdmin={isAdminView}
        adminPortalUrl={process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "/"}
      >
        <div className="fts-animate-in">{children}</div>
      </EmployeePortalChrome>
    </div>
  );
}
