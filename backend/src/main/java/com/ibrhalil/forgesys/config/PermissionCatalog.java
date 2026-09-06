package com.ibrhalil.forgesys.config;

import java.util.List;

/**
 * Built-in IAM permission catalog seeded into every tenant ({@code iam:*} only).
 * {@code platform:*} lives in {@link PlatformPermissionCatalog} (code-only, never
 * seeded into tenant schemas — RISK-18 closed by K-50). Product-module permissions
 * (pm/apps/notes) are owned by their {@link ModuleDefinition} and seed on
 * activation. The Admin role holds everything via {@code all_permissions} — no
 * grant rows to keep in sync.
 */
public final class PermissionCatalog {

    public static final String ADMIN_ROLE_NAME = "Admin";

    public static final String IAM_USER_READ = "iam:user:read";
    public static final String IAM_USER_WRITE = "iam:user:write";
    public static final String IAM_USER_DELETE = "iam:user:delete";
    /** Scoped read: see the members of one's own groups (+ self) instead of the whole tenant. */
    public static final String IAM_GROUP_MEMBER_READ = "iam:group-member:read";
    public static final String IAM_ROLE_READ = "iam:role:read";
    public static final String IAM_ROLE_WRITE = "iam:role:write";
    public static final String IAM_ROLE_DELETE = "iam:role:delete";
    public static final String IAM_PERMISSION_READ = "iam:permission:read";
    public static final String IAM_PERMISSION_WRITE = "iam:permission:write";
    public static final String IAM_PERMISSION_DELETE = "iam:permission:delete";
    public static final String IAM_GROUP_READ = "iam:group:read";
    public static final String IAM_GROUP_WRITE = "iam:group:write";
    public static final String IAM_GROUP_DELETE = "iam:group:delete";
    public static final String IAM_AUDIT_READ = "iam:audit:read";
    public static final String IAM_MODULE_READ = "iam:module:read";
    public static final String IAM_MODULE_WRITE = "iam:module:write";
    public static final String IAM_SAVED_VIEW_READ = "iam:saved-view:read";
    public static final String IAM_SAVED_VIEW_WRITE = "iam:saved-view:write";

    // pm:* — definitions live in ModuleDefinition.PM (module-owned); constants here
    // are the single naming source referenced by controllers.
    public static final String PM_PROJECT_READ = "pm:project:read";
    public static final String PM_PROJECT_WRITE = "pm:project:write";
    public static final String PM_PROJECT_DELETE = "pm:project:delete";
    public static final String PM_TASK_READ = "pm:task:read";
    public static final String PM_TASK_WRITE = "pm:task:write";
    public static final String PM_TASK_DELETE = "pm:task:delete";

    // apps:* — definitions in ModuleDefinition.APPS; property/view CRUD rides
    // apps:customapp:write (part of the definition, not data).
    public static final String APPS_CUSTOM_APP_READ = "apps:customapp:read";
    public static final String APPS_CUSTOM_APP_WRITE = "apps:customapp:write";
    public static final String APPS_CUSTOM_APP_DELETE = "apps:customapp:delete";
    public static final String APPS_RECORD_READ = "apps:record:read";
    public static final String APPS_RECORD_WRITE = "apps:record:write";
    public static final String APPS_RECORD_DELETE = "apps:record:delete";

    // notes:* — definitions in ModuleDefinition.NOTES; category delete rides
    // notes:category:write (categories are shared taxonomy, not data).
    public static final String NOTES_NOTE_READ = "notes:note:read";
    public static final String NOTES_NOTE_WRITE = "notes:note:write";
    public static final String NOTES_NOTE_DELETE = "notes:note:delete";
    public static final String NOTES_CATEGORY_READ = "notes:category:read";
    public static final String NOTES_CATEGORY_WRITE = "notes:category:write";

    public record PermissionDefinition(String name, String description) {
    }

    public static final List<PermissionDefinition> IAM_PERMISSIONS = List.of(
            new PermissionDefinition(IAM_USER_READ, "Read tenant users"),
            new PermissionDefinition(IAM_USER_WRITE, "Create or update tenant users"),
            new PermissionDefinition(IAM_USER_DELETE, "Delete tenant users"),
            new PermissionDefinition(IAM_GROUP_MEMBER_READ, "Read members of own groups (scoped user visibility)"),
            new PermissionDefinition(IAM_ROLE_READ, "Read tenant roles"),
            new PermissionDefinition(IAM_ROLE_WRITE, "Create or update tenant roles"),
            new PermissionDefinition(IAM_ROLE_DELETE, "Delete tenant roles"),
            new PermissionDefinition(IAM_PERMISSION_READ, "Read tenant permissions"),
            new PermissionDefinition(IAM_PERMISSION_WRITE, "Create or update tenant permissions"),
            new PermissionDefinition(IAM_PERMISSION_DELETE, "Delete tenant permissions"),
            new PermissionDefinition(IAM_GROUP_READ, "Read tenant groups"),
            new PermissionDefinition(IAM_GROUP_WRITE, "Create or update tenant groups"),
            new PermissionDefinition(IAM_GROUP_DELETE, "Delete tenant groups"),
            new PermissionDefinition(IAM_AUDIT_READ, "Read tenant audit logs and login history"),
            new PermissionDefinition(IAM_MODULE_READ, "Read tenant modules (catalog + activation state)"),
            new PermissionDefinition(IAM_MODULE_WRITE, "Activate tenant modules"),
            new PermissionDefinition(IAM_SAVED_VIEW_READ, "Read own saved list views"),
            new PermissionDefinition(IAM_SAVED_VIEW_WRITE, "Create, replace or delete own saved list views")
    );

    private PermissionCatalog() {
    }
}
