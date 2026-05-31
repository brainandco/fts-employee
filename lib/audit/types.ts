export type AuditPortal = "admin" | "employee";

export type AuditActionCategory =
  | "auth"
  | "file"
  | "data"
  | "assignment"
  | "approval"
  | "export"
  | "import"
  | "system"
  | "api";

export type AuditEntityType =
  | "user"
  | "employee"
  | "region"
  | "project"
  | "team"
  | "task"
  | "approval"
  | "asset"
  | "sim_card"
  | "vehicle"
  | "vehicle_maintenance"
  | "role"
  | "permission"
  | "employee_file"
  | "pp_report"
  | "field_file"
  | "leave"
  | "delegation"
  | "transfer"
  | "receipt"
  | "company_document"
  | "software"
  | "export"
  | "import"
  | "notification"
  | "profile"
  | "auth"
  | "pp_hierarchy"
  | "api"
  | "system";

export type AuditLogInput = {
  actionType: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  description?: string | null;
  meta?: Record<string, unknown> | null;
  portal?: AuditPortal;
  routePath?: string | null;
  httpMethod?: string | null;
  statusCode?: number | null;
  actionCategory?: AuditActionCategory;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};
