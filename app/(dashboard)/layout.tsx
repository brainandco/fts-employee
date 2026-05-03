import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { EmployeePortalChrome } from "@/components/layout/EmployeePortalChrome";
import type { EmployeeNavSection } from "@/components/layout/EmployeeSidebar";

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
    .select("id, full_name, status, region_id, avatar_url")
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
    await supabase.auth.signOut();
    const inactiveMsg =
      "Your employee account is inactive. Please contact your administrator to activate your account before you can access the Employee Portal.";
    const fallbackMsg = "No active employee or admin account for this sign-in. Contact your administrator.";
    const err = employee && employee.status !== "ACTIVE" ? inactiveMsg : fallbackMsg;
    redirect("/login?error=" + encodeURIComponent(err));
  }

  const dataClient = await getDataClient();
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
    isPp = roleSet.has("PP");
    isProjectCoordinator = roleSet.has("Project Coordinator");
    showTransferRequestsNav =
      isPm ||
      isQc ||
      roleSet.has("DT") ||
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
          ? "Post Processor"
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
        items: [
          { href: "/dashboard/pp-workspace", label: "Files workspace" },
          { href: "/dashboard/my-files", label: "My personal files" },
        ],
      },
      {
        label: "Post Processor",
        items: [
          { href: "/dashboard/pp", label: "Teams overview" },
          { href: "/dashboard/pp/teams", label: "Teams (detail)" },
          { href: "/dashboard/pp/leaves", label: "Team leave" },
        ],
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
    if (isPp && navSections.length === 0) {
      navSections.push({
        label: "Post Processor",
        items: [
          { href: "/dashboard/pp", label: "Teams overview" },
          { href: "/dashboard/pp/teams", label: "Teams (detail)" },
          { href: "/dashboard/pp/leaves", label: "Team leave" },
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
