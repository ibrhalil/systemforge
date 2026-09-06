/**
 * Canonical permission strings, mirroring the backend {@code PermissionCatalog}
 * ({@code backend/.../config/PermissionCatalog.java}). Format: `module:resource:action`.
 * The backend is the source of truth and admins can add runtime permissions — these
 * constants cover only the built-in catalog consumed by navigation and route guards.
 */
export const PERMISSIONS = {
  USER_READ: 'iam:user:read',
  USER_WRITE: 'iam:user:write',
  USER_DELETE: 'iam:user:delete',
  GROUP_MEMBER_READ: 'iam:group-member:read',
  ROLE_READ: 'iam:role:read',
  ROLE_WRITE: 'iam:role:write',
  ROLE_DELETE: 'iam:role:delete',
  GROUP_READ: 'iam:group:read',
  GROUP_WRITE: 'iam:group:write',
  GROUP_DELETE: 'iam:group:delete',
  PERMISSION_READ: 'iam:permission:read',
  PERMISSION_WRITE: 'iam:permission:write',
  PERMISSION_DELETE: 'iam:permission:delete',
  AUDIT_READ: 'iam:audit:read',
  MODULE_READ: 'iam:module:read',
  MODULE_WRITE: 'iam:module:write',
  SAVED_VIEW_READ: 'iam:saved-view:read',
  SAVED_VIEW_WRITE: 'iam:saved-view:write',
  PROJECT_READ: 'pm:project:read',
  PROJECT_WRITE: 'pm:project:write',
  PROJECT_DELETE: 'pm:project:delete',
  TASK_READ: 'pm:task:read',
  TASK_WRITE: 'pm:task:write',
  TASK_DELETE: 'pm:task:delete',
  // apps:* — custom app builder module (K-15 / Faz 3.0.B); seeded on module activation.
  CUSTOM_APP_READ: 'apps:customapp:read',
  CUSTOM_APP_WRITE: 'apps:customapp:write',
  CUSTOM_APP_DELETE: 'apps:customapp:delete',
  CUSTOM_APP_RECORD_READ: 'apps:record:read',
  CUSTOM_APP_RECORD_WRITE: 'apps:record:write',
  CUSTOM_APP_RECORD_DELETE: 'apps:record:delete',
  // notes:* — standalone notes module (K-44 / Epic 3.2); seeded on module activation.
  NOTE_READ: 'notes:note:read',
  NOTE_WRITE: 'notes:note:write',
  NOTE_DELETE: 'notes:note:delete',
  NOTE_CATEGORY_READ: 'notes:category:read',
  NOTE_CATEGORY_WRITE: 'notes:category:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Platform permission catalog (K-50), mirroring the backend
 * {@code PlatformPermissionCatalog} — in-code only, never seeded to tenants
 * (RISK-18). HUMAN platform users hold ALL of these; the platform console routes
 * and nav gate on them.
 */
export const PLATFORM_PERMISSIONS = {
  COMPANY_READ: 'platform:company:read',
  COMPANY_WRITE: 'platform:company:write',
  TENANT_ACCESS: 'platform:tenant:access',
  TENANT_LIFECYCLE: 'platform:tenant:lifecycle',
  TENANT_REPORT: 'platform:tenant:report',
  SERVICE_ACCOUNT_MANAGE: 'platform:service-account:manage',
  AUDIT_READ: 'platform:audit:read',
  MAIL_TEST: 'platform:mail:test',
} as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];
