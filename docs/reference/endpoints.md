# Endpoint Inventory (reference)

> On-demand reference — NOT loaded into agent context automatically. Source of truth: controllers (`backend/.../controller/`) + springdoc (`/v3/api-docs`, dev). Update this file when an endpoint's path/permission/behavior contract changes. Conventions (PageResponse, SortGuard, error shape, `sq` wire) live in `backend/AGENTS.md`.

RBAC enforcement via `@EnableMethodSecurity` (`SecurityConfig`) + `@PreAuthorize` (K-26). Tenant permission namespace `{module}:{resource}:{action}` — see `PermissionCatalog.IAM_PERMISSIONS` (iam:*) and `RbacSeeder`. Platform permissions (`platform:*`, 8 names) live ONLY in `PlatformPermissionCatalog` (K-50) — NEVER seeded into tenant schemas; every platform endpoint additionally requires `authentication.principal.scope == 'platform'`.

## Public (no auth, `SecurityConfig.permitAll`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/company/register` | K-21 phase 1 — creates a `PROVISIONING` Company + `TenantVerificationToken` and emails the verification link. 202 Accepted (tenant not ready yet). NO schema/Flyway/admin user. |
| `POST` | `/api/v1/auth/company/verify` | K-21 phase 2 — consumes the token, runs `CREATE SCHEMA` + Flyway tenant migration + admin user, promotes Company to `ACTIVE`. 200 OK. |
| `POST` | `/api/v1/auth/company/suggest-subdomain` | K-21 — slug candidates (Turkish-aware) for an org name; up to 3 unique suggestions. |
| `POST` | `/api/v1/auth/verify-email` | [K-48] consumes a single-use email-verification token (`t_auth_tokens`, digest lookup). Public; tenant from `TenantFilter` (subdomain-anchored link). Already-verified → idempotent 200. |
| `POST` | `/api/v1/auth/forgot-password` | [K-48] starts the self-service password reset. ALWAYS 200 — unknown/disabled addresses and mail failures are indistinguishable (no enumeration). |
| `POST` | `/api/v1/auth/reset-password` | [K-48] consumes the reset token, applies the new password and kills ALL of the user's sessions (admin-reset revoke chain). Audited `user_password_reset_self`. |
| `POST` | `/api/v1/auth/login` | Email+password → RS256 access token + opaque refresh token. Cookies (`sf_access_token`, `sf_refresh_token`) + body. Tenant resolved by subdomain. Unknown/bad-password both → `401 auth_bad_credentials` (no enumeration). |
| `POST` | `/api/v1/auth/refresh` | Rotates the refresh token (cookie or body) and mints a fresh access token (K-34). Public; tenant from `TenantFilter`; authorities re-resolved from DB. Reuse of a consumed token → `401 auth_refresh_token_reuse` (all sessions revoked). |
| `POST` | `/api/v1/platform/auth/login` | K-50 platform login — same shape as tenant login but against `public.t_platform_users` (SERVICE/no-password → uniform 401; lockout parity 5/15). Sets `sf_platform_*` cookies (path `/api/v1/platform`) + body; JWT carries `scope=platform`, NO tenant claim. |
| `POST` | `/api/v1/platform/auth/refresh` | K-50 platform refresh rotation — Redis store reused with the `tenant="platform"` marker (marker mismatch → revoke + 401; reuse → revokeAll + `tokenInvalidBefore` stamp + 401). |
| `POST` | `/api/v1/auth/platform-switch` | K-50 impersonation exchange — permitAll but TENANT-scoped (runs on the target tenant's subdomain host): one-time switch code (atomic Lua GETDEL; schema in code MUST equal `TenantContext`, else the code still burns → 401) → short-lived impersonation JWT (`act`/`act_email`/`imp` claims; token in body AND tenant cookie; NO refresh token). |
| `GET` | `/actuator/health/**`, `/actuator/info` | Health/info (prod exposes health + info + prometheus). |
| `GET` | `/actuator/prometheus` | Prometheus text exposition format (dev/test: same-port unauthenticated; prod: separate management port 8081, internal-only). |
| `GET` | `/actuator/metrics` | Per-metric debugging endpoint (dev/test only; prod unexposed). |

## Authenticated self-service (any logged-in user, no `iam:*` permission)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/logout` | Per-session logout (K-34): consumes this device's refresh token + blacklists the current access token's `jti` (granular revoke). Expires both cookies. Other devices keep working. |
| `GET` | `/api/v1/users/me` | The single /me (K-37): full self view from the DB + the authorities embedded in the access token. Backs both the SPA bootstrap (`authStore`) and the profile page. |
| `PUT` | `/api/v1/users/me/profile` | Update own profile (firstName/lastName/phone). |
| `PUT` | `/api/v1/users/me/password` | Change own password (current password verified). |
| `GET` | `/api/v1/users/me/sessions` · `DELETE /me/sessions/{sessionId}` | Own active sessions (K-28) + revoke one (access token dies immediately via `tokenInvalidBefore` stamp). |

## Tenant-scoped admin (RBAC, `iam:*` — `@PreAuthorize`)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/api/v1/users` (page; `?q=` — matches email/username/first/last name) · `GET /{id}` | `iam:user:read` OR `iam:group-member:read` |
| `POST` | `/api/v1/users/search` (SearchRequest body — filter engine) | `iam:user:read` OR `iam:group-member:read` |
| `POST` | `/api/v1/users` · `PUT /{id}` · `PUT /{id}/roles` · `PUT /{id}/groups` · `PATCH /{id}/password` · `POST /{id}/unlock` (204) · `POST /{id}/resend-verification` ([K-48] 409 `user_already_verified`) | `iam:user:write` |
| `DELETE` | `/api/v1/users/{id}` | `iam:user:delete` |
| `GET` | `/api/v1/users/{id}/activity` (temporal activity summary) | `iam:user:read` OR `iam:group-member:read` |
| `GET` | `/api/v1/users/{id}/sessions` · `DELETE /{id}/sessions/{sessionId}` · `DELETE /{id}/sessions` (K-28) · `GET /api/v1/sessions` (tenant-wide) | `iam:user:write` |
| `GET` | `/api/v1/roles` (page; `?q=`) · `GET /{id}` | `iam:role:read` |
| `POST` | `/api/v1/roles` · `PUT /{id}` · `PUT /{id}/permissions` · `PUT /{id}/parents` | `iam:role:write` |
| `DELETE` | `/api/v1/roles/{id}` | `iam:role:delete` |
| `GET` | `/api/v1/groups` (page; `?q=`) · `GET /{id}` | `iam:group:read` |
| `POST` | `/api/v1/groups` · `PUT /{id}` · `PUT /{id}/roles` · `PUT /{id}/members` | `iam:group:write` |
| `DELETE` | `/api/v1/groups/{id}` | `iam:group:delete` |
| `GET` | `/api/v1/permissions` (page; `?q=` — matches name) · `GET /{id}` | `iam:permission:read` |
| `POST` | `/api/v1/permissions` · `PUT /{id}` | `iam:permission:write` |
| `DELETE` | `/api/v1/permissions/{id}` | `iam:permission:delete` |
| `GET` | `/api/v1/modules` (catalog + activation state + plan eligibility) | `iam:module:read` |
| `POST` | `/api/v1/modules/{key}/activate` (idempotent) | `iam:module:write` |
| `GET` | `/api/v1/saved-views?storageKey=` (own views only — documented `List<T>` exception, design-bounded per user+table) | `iam:saved-view:read` |
| `POST` | `/api/v1/saved-views` (create-or-replace: case-insensitive name per user+table) · `DELETE /{id}` (foreign id = 404) | `iam:saved-view:write` |
| `GET` | `/api/v1/users/{id}/effective-permissions` · `GET /api/v1/groups/{id}/effective-permissions` | `iam:user:read` / `iam:group:read` |
| `GET` | `/api/v1/custom-apps/{customAppId}/properties` · `/{customAppId}/views` | `apps:customapp:read` |
| `POST` | `/api/v1/custom-apps/{customAppId}/properties` · `PUT /{propertyId}` · `DELETE /{propertyId}` | `apps:customapp:write` |
| `POST` | `/api/v1/custom-apps/{customAppId}/views` · `PUT /{viewId}` · `DELETE /{viewId}` | `apps:customapp:write` |
| `GET` | `/api/v1/custom-apps/{customAppId}/records` (page) · `GET /{recordId}` | `apps:record:read` |
| `POST` | `/api/v1/custom-apps/{customAppId}/records` · `PATCH /{recordId}` (partial merge) | `apps:record:write` |
| `POST` | `/api/v1/custom-apps/{customAppId}/records/search` (JSONB filter/sort — **PostgreSQL-only**) | `apps:record:read` |
| `DELETE` | `/api/v1/custom-apps/{customAppId}/records/{recordId}` | `apps:record:delete` |
| `GET` | `/api/v1/projects` (page; `?q=` · `?parentProjectId=` · `?type=`) · `GET /{id}` | `pm:project:read` |
| `GET` | `/api/v1/projects/types` (creatable type catalog — ACTIVE modules only, K-45; registry-bounded `List` exception) | `pm:project:read` |
| `POST` | `/api/v1/projects` · `PUT /{id}` (guards: parent cycle 409, type locked while content exists 409 `project_type_change_forbidden`, default container frozen 409, inactive-module type 409 `module_not_active`) | `pm:project:write` |
| `DELETE` | `/api/v1/projects/{id}` | `pm:project:delete` |
| `GET` | `/api/v1/projects/{projectId}/tasks` (page) · `GET /{taskId}` | `pm:task:read` |
| `POST` | `/api/v1/projects/{projectId}/tasks` · `PUT /{taskId}` · `DELETE /{taskId}` | `pm:task:*` |
| `GET` | `/api/v1/notes` (page; `?q=` title+content · `?categoryId=` · `?pinned=` · `?projectId=` cross-container, K-45) · `GET /{id}` | `notes:note:read` |
| `POST` | `/api/v1/notes` (absent `projectId` → default "Genel" NOTES container) · `PUT /{id}` (projectId move allowed) | `notes:note:write` |
| `DELETE` | `/api/v1/notes/{id}` | `notes:note:delete` |
| `GET` | `/api/v1/projects/{projectId}/notes` (page; nested — 404 unknown, 409 `project_type_mismatch` non-NOTES) | `notes:note:read` |
| `POST` | `/api/v1/projects/{projectId}/notes` (anchored to the container; category must belong to it — 409 `note_category_project_mismatch`) | `notes:note:write` |
| `GET` | `/api/v1/note-categories` (page; `?q=` name · `?projectId=`) · `GET /{id}` | `notes:category:read` |
| `POST` | `/api/v1/note-categories` · `PUT /{id}` (project move rejected 409) · `DELETE /{id}` (notlar kategorisiz kalır — FK SET NULL) | `notes:category:write` |
| `GET` | `/api/v1/projects/{projectId}/note-categories` (page; NOTES containers only) · `POST` same path | `notes:category:*` |
| `GET` | `/api/v1/custom-apps` (page; `?q=` · `?projectId=` cross-container, K-45) · `GET /{id}` (definition + properties + views) | `apps:customapp:read` |
| `GET` | `/api/v1/custom-apps/plan-limits` (plan usage values from the `PlanDefinition` registry — K-43) | `apps:customapp:read` |
| `POST` | `/api/v1/custom-apps` (absent `projectId` → default "Genel" APPS container; tenant-level plan limits unchanged) · `PUT /{id}` (projectId move between APPS containers allowed) | `apps:customapp:write` |
| `DELETE` | `/api/v1/custom-apps/{id}` | `apps:customapp:delete` |
| `GET` | `/api/v1/projects/{projectId}/custom-apps` (page; APPS collection containers only) · `POST` same path | `apps:customapp:*` |

> `PermissionController` is full CRUD. The built-in catalog is seed-driven (`PermissionCatalog` + `RbacSeeder`), but admins can also create runtime permissions — the name MUST match `^[a-z][a-z0-9]*:[a-z][a-z0-9-]*:[a-z]+$`. Deletion is blocked while a permission is still assigned to any role (`permission_in_use`, 409). The `effective-permissions` endpoints resolve the full chain (direct + active-group roles + transitive parent inheritance) into sorted permission-name strings.

> **User directory read path (K-49):** `GET /users` (+`?qFields=`) and `POST /users/search` return the flat `UserDirectoryViewResponse` (id/username/email/emailVerified/first/last/enabled/lastLoginAt/createdDate/roleCount/groupCount) via `UserDirectoryQueryExecutor` — a Criteria DTO projection over the User root (profile/account to-one LEFT joins + correlated count subqueries). Registrable columns: direct attrs, joined profile/account fields, `roleCount`/`groupCount` subquery scalars, `roleIds`/`groupIds` membership filters. The DETAIL endpoints (`GET /{id}`, effective-permissions) still resolve the full `UserResponse` with role/group sets via the entity path. List rows are counts; modals that need current assignments fetch the detail themselves.

> **Scoped user visibility (`iam:group-member:read`):** user read endpoints accept EITHER `iam:user:read` (full tenant) or `iam:group-member:read` (members of the caller's own groups + self). Scope applied in `UserService` (`applyVisibilityScope` narrows the list Specification; `assertViewable` guards detail + effective-permissions with 403). Row-level visibility inside the tenant — tenant-schema isolation is untouched.

> **All-permissions flag (`t_roles.all_permissions`):** a role carrying the flag implicitly holds EVERY permission in the tenant, resolved dynamically by `CustomUserDetailsService.resolvePermissionNames` (checked after the parent-role closure, so inheritance from an all-permissions role is all-permissions too). Built-in `Admin` role is seeded with the flag. `PUT /roles/{id}/permissions` accepts `{all:true}` or `{permissionIds:[...]}`; `RoleResponse.allPermissions` exposes the state. Creating/renaming a permission fires `SessionRevocationService.revokeAllPermissionsRoleHolders`.

## Platform surface (cross-tenant, K-50 — `platform:*` + `scope == 'platform'` on EVERY endpoint)

Platform identities (HUMAN superadmins + SERVICE accounts) live in `public.t_platform_users`; they authenticate via the platform auth endpoints (above) or statelessly via `X-API-Key` (`PlatformApiKeyAuthenticationFilter`). All platform endpoints run tenant-less (`TenantFilter` skips `/api/v1/platform/**`; queries hit the `public` schema through `TenantContextExecutor.withoutTenantContext`). A tenant JWT — even one carrying legacy `platform:*` authorities — is 403 (RISK-18 closed).

| Method | Path | Permission |
|--------|------|------------|
| `POST` | `/api/v1/platform/auth/logout` (204) | `scope=='platform'` |
| `GET` | `/api/v1/platform/me` | `scope=='platform'` |
| `GET` | `/api/v1/platform/companies` (page; `?q=`/`?qFields=`) · `GET /{id}` | `platform:company:read` |
| `POST` | `/api/v1/platform/companies/search` (filter engine) | `platform:company:read` |
| `PATCH` | `/api/v1/platform/companies/{id}/status` | `platform:company:write` |
| `GET`/`PUT` | `/api/v1/platform/companies/{id}/subscription` | `platform:company:read` / `platform:tenant:lifecycle` |
| `GET`/`PUT` | `/api/v1/platform/companies/{id}/modules` (deactivate = soft-delete of `t_tenant_modules`; module cleanup Faz 6) | `platform:company:read` / `platform:tenant:lifecycle` |
| `GET` | `/api/v1/platform/companies/{id}/report` (users/projects/apps/notes count queries — no entity hydration) | `platform:tenant:report` |
| `POST` | `/api/v1/platform/companies/{id}/switch` (reason required → one-time code 30s + `targetUrl`) | `platform:tenant:access` |
| `POST`/`GET`/`DELETE` | `/api/v1/platform/service-accounts` (create → raw key `<prefix8>_<secret43>` EXACTLY once; list never raw; revoke = `revoked_at` + disable) | `platform:service-account:manage` |
| `GET` | `/api/v1/platform/audit-logs` (page; GET-param filters action/actorId/targetType/fromDate/toDate + `q`) | `platform:audit:read` |
| `GET` | `/api/v1/platform/mail/info` (K-51 — active channel/from/default language/templatesDir + template catalog) | `platform:mail:test` |
| `POST` | `/api/v1/platform/mail/preview` (K-51 — render a template with sample data, NO send; per-request `language` tr/en) | `platform:mail:test` |
| `POST` | `/api/v1/platform/mail/test-send` (K-51 — test mail through the active sender, fail-loud; audited `platform_mail_test_sent`; response echoes the channel) | `platform:mail:test` |

> **Switch/impersonation (K-50):** `PlatformSwitchService.start` stores a one-time code (`switch:code:<sha256>`, 30s TTL) + a concurrency guard (`switch:active:<actorId>` — max 1 concurrent impersonation per platform identity). The target is the tenant's earliest-created admin-capable user (RISK-35 all-permissions closure — `LastAdminGuard.adminCapableRoleIds()` reused); no admin → 409 `platform_no_admin_in_tenant`. The exchange (`/auth/platform-switch`) re-checks company ACTIVE + target enabled/locked, mints the impersonation JWT (`AuditorAware` prefers `act`), audits BOTH sides, and logout ends the session (jti blacklist + compare-and-delete guard clear + `platform_switch_ended` audit). Store is profile-split Redis/in-memory with RISK-36 posture (issue fail-closed → 503, claim → 401, guard ops fail-open).

## Audit & log (tenant, `iam:audit:read` — K-19)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/api/v1/audit-logs` (page; `?action=` / `?actorId=`) | `iam:audit:read` |
| `GET` | `/api/v1/login-history` (page; `?userId=` / `?success=`) | `iam:audit:read` |
| `GET` | `/api/v1/request-logs` (page; filter-engine whitelist — request metadata + masked high-risk bodies) | `iam:audit:read` |
| `GET` | `/api/v1/request-logs/export` (CSV — K-55 F5: `sq`/flat-filtered, UTF-8 BOM, RFC 4180, ≤10k rows, `@AuditLog` `request_logs_exported`) | `iam:audit:read` |

> `AuditQueryService` + `RequestLogQueryService` read `t_audit_logs` + `t_login_history` + `t_request_logs` (tenant schema), paged newest-first with optional filters. `iam:audit:read` is seeded into the `Admin` role via `PermissionCatalog`.

## Auth stack behavior notes

> **Auth stack:** RS256 JWT (custom `JwtAuthenticationFilter`, [RISK-14]). `JwtTokenProvider` mints tokens (sub=userId; claims: email/tenant/authorities/jti) + the platform variants (`scope=platform`, no tenant claim; impersonation: `act`/`act_email`/`imp`). Filter order: cookie/header decode → `scope=platform` branch (platform cookie wins when both present; revocation via `PlatformUserRepository.findTokenInvalidBefore`; the branch MUST split BEFORE the tenant lookup, `public.t_users` does not exist; context must be tenant-less) → tenant claim == `TenantContext` ([RISK-19]) → `tokenInvalidBefore` check (user-scoped revoke) → `jti` blacklist check (`TokenBlacklistService` Redis `bl:jti:{jti}`) → `CustomUserDetails`. Before it, `PlatformApiKeyAuthenticationFilter` (chain order in `SecurityConfig`: rate-limit → api-key → jwt) authenticates `X-API-Key` requests statelessly: header-only match, active tenant context → 401 BEFORE any DB hit, prefix lookup → constant-time `TokenHasher` compare → scope authorities as `scope=platform` principal; every failure is a uniform 401 `platform_api_key_invalid` + platform audit row. RSA keys: configured PEMs in prod (fail-fast, [RISK-23]), ephemeral in dev/test.

> **Refresh tokens (K-34):** opaque, Redis SHA-256 hash-at-rest, atomic Lua rotation + reuse detection (reuse → revoke all + `tokenInvalidBefore` → `auth_refresh_token_reuse`). `POST /auth/refresh` re-resolves authorities from DB (locked/disabled re-check). Store impls are `@Profile`-split (`Redis*` dev/prod, `InMemory*` test). **Redis-outage behavior (RISK-36):** rate-limiter + blacklist fail-open; `rotate` degrades to a clean 401, session list/revoke to empty/false; only `issue` fails closed (503 `service_unavailable`).

> **Brute-force lockout (RISK-22):** 5 failed attempts / 15 min → 423 `auth_account_locked`; lock also stamps `tokenInvalidBefore` and blocks refresh. User email verification + password reset landed as K-48 (`t_auth_tokens`, tenant V4). Deferred: PermissionCacheService (low value — authorities are embedded in the JWT).

> **Two-phase signup (K-21):** register → 202 + `PROVISIONING` Company + `TenantVerificationToken`; verify → `CREATE SCHEMA` + programmatic Flyway + admin user + `ACTIVE`. DDL inside `verifyAndProvision` is an implicit commit ([DEBT-10] partial).

> **Audit 3-layer log (K-19 + K-27):** `@AuditLog` AOP writes `t_audit_logs` (actor from SecurityContext, IP/traceId from `RequestContext`, `captureDelta` at privilege-change points); `LoginHistoryService` writes `t_login_history` per attempt; `RequestMetadataFilter` + `RequestLogFilter`/`RequestBodyCaptureFilter` write `t_request_logs` (masked bodies on high-risk paths). `t_audit_logs`/`t_login_history` append-only (DB trigger). All writes `REQUIRES_NEW` + best-effort. Deferred K-27 (LOW): approval workflow + anomaly detection.
