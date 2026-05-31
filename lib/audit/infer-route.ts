import type { AuditActionCategory, AuditEntityType } from "@/lib/audit/types";

const SKIP_PATH_PREFIXES = [
  "/api/notifications/recent",
  "/api/auth/callback",
];

export function shouldSkipApiAudit(pathname: string): boolean {
  return SKIP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function shouldLogApiMethod(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m !== "GET") return true;
  const p = pathname.toLowerCase();
  return (
    p.includes("download") ||
    p.includes("presign") ||
    p.includes("folder-zip") ||
    p.includes("/browse") ||
    p.includes("multipart")
  );
}

export function inferFromApiRoute(
  method: string,
  pathname: string
): {
  actionType: string;
  entityType: AuditEntityType;
  actionCategory: AuditActionCategory;
  description: string;
} {
  const m = method.toUpperCase();
  const p = pathname.toLowerCase();

  if (p.includes("/auth/login")) {
    return { actionType: "login", entityType: "auth", actionCategory: "auth", description: "User signed in" };
  }
  if (p.includes("/auth/logout")) {
    return { actionType: "logout", entityType: "auth", actionCategory: "auth", description: "User signed out" };
  }

  if (p.includes("presign-batch") || p.includes("presign")) {
    return {
      actionType: "file_upload_init",
      entityType: "employee_file",
      actionCategory: "file",
      description: `${m} upload presign — ${pathname}`,
    };
  }
  if (p.includes("multipart-init") || p.includes("multipart-part-urls")) {
    return {
      actionType: "file_upload_multipart",
      entityType: "employee_file",
      actionCategory: "file",
      description: `${m} multipart upload — ${pathname}`,
    };
  }
  if (p.includes("multipart-complete") || p.includes("/complete-batch") || p.endsWith("/complete")) {
    return {
      actionType: "file_upload_complete",
      entityType: "employee_file",
      actionCategory: "file",
      description: `${m} upload complete — ${pathname}`,
    };
  }
  if (p.includes("/download") || p.includes("folder-zip") || p.includes("/zip-p/")) {
    return {
      actionType: "file_download",
      entityType: "employee_file",
      actionCategory: "file",
      description: `${m} download / zip — ${pathname}`,
    };
  }
  if (p.includes("/delete")) {
    return {
      actionType: "file_delete",
      entityType: "employee_file",
      actionCategory: "file",
      description: `${m} file delete — ${pathname}`,
    };
  }

  if (p.includes("/assign")) {
    return {
      actionType: "assign",
      entityType: "asset",
      actionCategory: "assignment",
      description: `${m} assignment — ${pathname}`,
    };
  }
  if (p.includes("/leave")) {
    return {
      actionType: m === "POST" ? "leave_submit" : "leave_view",
      entityType: "leave",
      actionCategory: "approval",
      description: `${m} leave — ${pathname}`,
    };
  }
  if (p.includes("/transfer")) {
    return {
      actionType: "transfer",
      entityType: "transfer",
      actionCategory: "data",
      description: `${m} transfer — ${pathname}`,
    };
  }
  if (p.includes("/receipt")) {
    return {
      actionType: "receipt",
      entityType: "receipt",
      actionCategory: "assignment",
      description: `${m} receipt — ${pathname}`,
    };
  }

  const genericAction =
    m === "POST" ? "create" : m === "PUT" || m === "PATCH" ? "update" : m === "DELETE" ? "delete" : "api_access";

  return {
    actionType: genericAction,
    entityType: "api",
    actionCategory: "api",
    description: `${m} ${pathname}`,
  };
}
