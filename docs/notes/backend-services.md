# Backend service notes ("why" stories)

> Moved out of source comments. Index: [docs/CODE_NOTES.md](../CODE_NOTES.md) · rules: [backend/AGENTS.md](../../backend/AGENTS.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md)

## backend/service — exception

### UserService
- `FILTER_FIELDS` (K-49): joined profile/account columns resolve through to-one LEFT joins; `roleCount`/`groupCount` through correlated subqueries; `roleIds`/`groupIds` are collection-membership filters (IN = has any of these, IS_NULL = none at all). Same set is the sort whitelist for `GET /users` and `POST /users/search`.
- Visibility scope (`applyVisibilityScope`): `iam:user:read` = unrestricted; `iam:group-member:read` = members of caller's own groups + self. Row-level visibility INSIDE the tenant, resolved as one extra `IN` predicate in the same query — tenant-schema isolation untouched.
- `assertViewable`: detail-scope guard for `findById`/`effectivePermissions`; throws 403 `auth_access_denied`. Self-service `/users/me` passes trivially (self always in scope).
- `activity`: last-failed-attempt comes from the append-only login history (K-19); the extra indexed single-row query is kept OUT of `toResponse` so mutation responses don't pay for it.
- `create`: optional roles/groups at creation validated up front (404 unknown ids); no session revoke needed because a brand-new user has no outstanding tokens. Email verification is optional-policy (user can log in immediately; mail only verifies the address) and best-effort AFTER commit — creation must never depend on SMTP; admin can resend.
- `verifyEmail`: idempotency design — a re-clicked link whose token is consumed succeeds silently WHEN the user is already verified (the common case); only a genuinely unusable token errors. Runs WITHOUT authenticated caller; tenant scope from `TenantFilter` (link is subdomain-anchored).
- `resendVerification`: fail-loud unlike creation's best-effort send — caller explicitly asked; SMTP failure rolls back tx + fresh token.
- `requestPasswordReset`: no account enumeration — unknown email, disabled account, and mail failure indistinguishable; even SMTP errors swallowed + logged (500-vs-200 would leak existence). Token single-use, short configured TTL, link subdomain-anchored.
- `resetPasswordWithToken`: RISK-21/K-34 revoke chain (same as admin reset) — `tokenInvalidBefore` kills outstanding access tokens, refresh tokens dropped. Audited `user_password_reset_self`, actor "system" fallback (unauthenticated).
- `update` (disable path): last-admin guard BEFORE save works because the JPQL existence check auto-flushes the pending `enabled=false` (sees post-mutation state); re-enable/no-op toggles fall through. Disabled user's tokens die immediately (JWT filter does not re-read account flags per request; login-side enable check is the complementary side-fix 1).
- `delete`: self-delete forbidden unconditionally (historical tenant-lockout cause: admin soft-deleting themselves). Last-admin check AFTER the soft-delete flush — violation rolls back the whole tx (delete undone) and the revoke never fires (no Redis-side carnage on rejection). Token revoke targets the row directly (independent of soft-delete).
- `unlock` (RISK-22): lock leaves refresh tokens in place (they work again once unlocked) → no session revive needed; no-op state-wise for a non-locked account (still audited).
- `setRoles`/`setGroups` (Faz 1): a set change can drop permissions outstanding tokens still carry — revoke immediately, not at access-token TTL. Guard auto-flushes the join-row removal first.
- `changePassword` (RISK-21): `tokenInvalidBefore = now()` rejects every pre-change access token in `JwtAuthenticationFilter`; multi-device logout by design. Granular single-session revoke deferred to Epic 2.6 (Redis blacklist).
- `resetPassword` (admin): no current-password verify (caller holds `iam:user:write`); same multi-device revoke semantics.
- `invalidateTokens` (RISK-21 + K-34 + Faz 1): centralized delegate to `SessionRevocationService.revokeUser` — stamps `tokenInvalidBefore` AND drops refresh tokens so a stolen refresh cannot mint a fresh access token whose `iat` post-dates the revoke.

### TenantProvisioningService
- Two-phase flow (K-21): phase 1 light + fully transactional (no DDL/Flyway/admin — squatting is cheap); phase 2 heavy + synchronous. Replaced the legacy single-phase `provisionTenant` (removed with the `email_domain` column).
- DEBT-10 (partial): `verifyAndProvision` is `@Transactional` for Company/token/user writes, but `CREATE SCHEMA` is an implicit commit in PostgreSQL — DDL escapes the tx. Partial-write recovery = idempotency (`CREATE SCHEMA IF NOT EXISTS`, token `usedAt` guard), not rollback.
- `self` ObjectProvider (RISK-26 fix): `createAdminUser`'s REQUIRES_NEW only works through the Spring proxy. Why REQUIRES_NEW at all: the outer `verifyAndProvision` tx holds a public-schema connection acquired BEFORE `TenantContext` switches; the admin write + RBAC seed must run in a fresh tx that re-resolves the tenant schema (session resolves schema at open) — otherwise the write goes to `search_path=public` and fails "relation does not exist".
- `verifyAndProvision` token semantics: RISK-25 — claim is an atomic conditional UPDATE (`claimToken`), NOT read-modify-write; two concurrent verifies sharing a link cannot both pass `isUsed()` and double-provision. First caller wins (claim=1), second gets `TENANT_TOKEN_ALREADY_USED`. Validity/expiry still SELECTed first so the precise error code is preserved. RISK-30 — presented raw token SHA-256-hashed before every lookup/claim (only digests in DB); `adminPasswordHash` nulled after `createAdminUser` succeeds (managed entity, flushes at commit; a rollback restores the hash so a DEBT-10 retry still finds it).
- Managed-entity sync after claim: `verification.setUsedAt(claimedAt)` avoids a redundant second UPDATE.
- TenantContext set BEFORE the REQUIRES_NEW proxy call: `CurrentTenantIdentifierResolver` resolves at session-open time; `createAdminUser` also sets defensively and clears in finally.
- FREE subscription + default module activations (K-16): `activateForCompany` manages its own TenantContext + REQUIRES_NEW; `pm` needs no extra migration (baseline tables).
- `registerSampleDataSeed` (K-47): afterCommit because the seed's REQUIRES_NEW tx must SEE the committed `t_tenant_modules` activation records + FREE subscription; under read-committed an inner tx cannot — a same-tx call fails the module gate (`MODULE_NOT_ACTIVE`) and plan chain (`SUBSCRIPTION_NOT_FOUND`) and is silently swallowed by the seed's fail-safe. Guard covers non-transactional callers (unit tests). Two-layer fail-safe: `seedForCompany` catches internally AND the callback catches again.
- `PendingSignup` carries the RAW token (RISK-30 hash-at-rest): raw goes to the mail link or, on bootstrap, straight to `verifyAndProvision` in memory.
- `createAdminUser`: admin credentials pre-hashed at phase 1, stored verbatim phase 2 (no re-hash). `assignAdminTo(user)` is the ONLY automatic Admin grant (no-op in `test`); startup seeding never touches user role assignments — privilege-escalation fix 2026-08-16 (role-less users used to be silently granted the all-permissions Admin role on every restart).
- `createDefaultSubscription`: fails fast when the FREE plan row is missing — `PlanSyncRunner` seeds plans before any provisioning can run. Real plan selection/upgrades arrive in Faz 6.
- Schema name derivation: subdomain lowercased, non-[a-z0-9-] stripped, `-`→`_`, `tenant_` prefix, regex-validated.

### AuthService
- No user-enumeration oracle: unknown email and wrong password both → `auth_bad_credentials`; remaining attempt count never surfaced; timing defense — unknown email still pays the bcrypt cost (discarded encode).
- Login ordering rationale: lock check (RISK-22) BEFORE password compare (no timing/attempt leak; expired lock resets the counter); disabled check AFTER password compare (unknown-email vs disabled not probeable without valid credentials; refresh already re-checks isEnabled, K-34).
- `login` `noRollbackFor = AuthException`: failed-attempt counter / lockout write happens right before the `badCredentials` throw and must survive it.
- Lazy pepper migration (K-23): successful login with a legacy pepper-less BCrypt hash is rehashed inline (`{sf-peppered}` marker), no extra round-trip.
- K-28: login captures device IP + User-Agent from `RequestContext` (populated by `RequestMetadataFilter`); store keeps them with the refresh-token hash so the session list shows "where you're logged in".
- Faz 5a session cap: `enforceSessionLimit` after issue — over cap, oldest sessions evicted; login always succeeds.
- `refresh` (K-34): authorities re-resolved from DB (permission changes + locked/disabled take effect at refresh); session tenant bound to request tenant (cross-tenant replay rejected, mirrors RISK-19 — freshly rotated token dropped then rejected); `noRollbackFor` keeps reuse revocation committed. Reuse detection: consumed token → revoke user's refresh tokens + `tokenInvalidBefore` (outstanding access tokens die) → `auth_refresh_token_reuse`.
- `logout` (K-34) per-session: consumes this device's refresh + blacklists the access `jti`; `tokenInvalidBefore` deliberately NOT set (that stays the nuclear path for password change/reset/reuse).
- `registerFailedAttempt` (RISK-22 + Faz 1): 5 attempts / 15 min lock; on lock `tokenInvalidBefore` is also stamped — a locked account is treated as suspected compromise, live sessions killed on the spot; refresh already blocked while locked (`accountNonLocked` re-check), so refresh tokens are left in place and work again after the window expires.

### GlobalExceptionHandler
- `NoResourceFoundException`: Spring 6.1+ static-resource chain throws this instead of a plain 404; mapped to standard `resource_not_found` (e.g. `/v3/api-docs` in a springdoc-disabled profile, K-41 prod gating).
- `AccessDeniedException`: method-level `@PreAuthorize` denials throw `AuthorizationDeniedException` (subclass) from the controller method, surfacing at the MVC layer — caught here, NOT by the filter-chain `RestAccessDeniedHandler`; 403 matches the wire contract.
- Client-error mappings (Faz D / RISK-29): malformed JSON body (`HttpMessageNotReadableException`), type-mismatched path/query params, missing `@RequestParam`, unknown sort property (`PropertyReferenceException`), and method-level Bean Validation all → 400 `validation_error` — without the handlers the catch-all turns each into a 500. Known property PATHS stay closed via `SortGuard` at the controller (handler only sees unknown property names). `ConstraintViolationException` handler is defensive/forward-compatible — controllers use `@Valid` → `MethodArgumentNotValidException`; kept so a future `@Validated` controller stays 400.
- `DataIntegrityViolationException` (RISK-28): TOCTOU uniqueness race — two requests pass the service `existsBy*`, one hits the DB constraint. Mapped to 400 with the precise `*_TAKEN` code via constraint-name substring map (`users_email`→`user_email_taken`, `users_username`, `roles_name`, `groups_name`, `permissions_name`, `projects_name`/`projects_type_name`, `note_categories_name`, `custom_apps_name`, `custom_app_properties_name`, `custom_app_views_name`, `tenant_modules_company_module`→`module_already_active`, `companies_subdomain`/`companies_schema_name`→`company_subdomain_taken`); unknown → `business_error` fallback, never 500. Service checks stay (defense-in-depth).
- `DataAccessException` → 503 `service_unavailable` (Redis/DB down — e.g. refresh-token `issue` that cannot persist): "retry later" distinguishable from a real bug; `DataIntegrityViolationException` keeps its more specific handler.
- Sensitive rejected values (`password`/`token`/`secret`/`credential`) masked to `[REDACTED]` for both `@RequestBody` field errors and `ConstraintViolation` invalid values.

### UserTokenService
- Conventions (RISK-30/RISK-25): hash-at-rest (only SHA-256 digest persisted; raw goes straight into the mailed link); re-issue supersedes (new token of a purpose stamps the user's outstanding tokens of that purpose `usedAt` — only the newest link works); atomic claim (conditional UPDATE; two concurrent consumers cannot both win).
- Error codes mirror tenant-signup semantics: `user_token_invalid` / `user_token_expired` / `user_token_already_used`; purpose mismatch → `user_token_INVALID` (a password-reset link must not consume an email-verify token).
- `peek`: digest lookup without consuming, whatever the used/expired state — the idempotency probe behind `UserService.verifyEmail`.
- Tenant-scoped via the caller's `TenantContext` (request filter or a set-and-restore window).
- `purgeStaleForCurrentTenant` (RISK-30): TokenPurgeJob hook; own tx per tenant schema via the job's set-and-restore window.

### SessionService
- K-28. Sessions scoped to request tenant + owner user; self endpoints self-scope, admin endpoints take an explicit user id.
- Single-session revoke semantics: the `tokenInvalidBefore` stamp is USER-scoped (the only immediate lever without per-session `jti` storage) — sibling devices briefly 401 then recover via their still-valid refresh token; the targeted device (whose refresh was dropped) is fully signed out. `revokeAllUserSessions` additionally drops every refresh token.

### RoleService
- `FILTER_FIELDS` (K-49): `permissionCount` subquery counts explicit grants only (0 for all-permissions roles); `permissionIds`/`parentIds` membership filters.
- `ALL_PERMISSIONS_SENTINEL`: audit-delta sentinel marking the all_permissions mode in old/new value JSON.
- `delete`: join tables `t_user_roles`/`t_group_roles` are owned by User.roles/Group.roles — leftover join rows after soft-delete keep managed collections referencing a deleted role → flush fails `TransientPropertyValueException` + orphan rows; hence detach BEFORE soft-delete. Revoke targets (direct + via active groups) resolved while the role is still visible (pre-soft-delete-filter); guard AFTER flush sees the deleted role (admin-closure queries) and runs BEFORE the revoke so a rejected delete leaves no Redis-side carnage.
- `setPermissions`: last-admin guard BEFORE save — clearing the `all_permissions` flag (or emptying the role) can drop every admin below the one-active-admin floor; closure queries auto-flush the pending change first. Faz 1 revoke: holders' outstanding tokens still embed the old permission set.
- `setParents` (Faz 4a): acyclicity — no self-parent, no candidate that transitively inherits from this role (`reaches` DFS). Faz 1 revoke + Faz 2b audit delta; guard covers inheritance-edge removal (e.g. removing an all-permissions parent).
- Persistent-collection mutation: clear+addAll on the managed collection, never replace the reference.

### GroupService
- `FILTER_FIELDS` (K-49): `memberIds` is an inverse-membership field — join table owned by `User.groups`, resolution starts from the member side.
- `effectivePermissions`: union of the group's roles' permissions expanded through transitive parents (a group carrying an admin role makes its members admins).
- `update(deactivate)`: existence query auto-flushes pending `active=false` (skips inactive groups) → guard sees post-mutation state. Deactivation drops every member's group-granted permissions (`resolveAuthorities` skips inactive groups) → revoke; activation grants at next login → no revoke.
- `delete`: `t_user_groups` owned by `User.groups` — same detach-before-soft-delete rationale as RoleService; guard after flush, revoke after guard.
- `setMembers`: replace semantics through each user's group set (User owns the join). Only REMOVED members are revoked (they lose permissions); added members gain at next login — adding someone to a group must not log them out. Guard: removing the last admin from an admin-carrying group (auto-flushed).

### PermissionService
- `create`: a new permission joins the all-permissions set dynamically — holders of an `all_permissions` role (Admin + any "ALL" role) should see it on their next request, not at access-token TTL (outstanding tokens embed the prior snapshot) → `revokeAllPermissionsRoleHolders`.
- `update` rename: changes the authority string every all-permissions user carries → same refresh rationale.
- `delete`: `permission_in_use` (409) while assigned to any role — deleting would silently shrink every bearer's authority set; unassigning already revokes via `RoleService.setPermissions`.

### ProjectService
- K-45: `type` decides which module's content lives inside; creatable catalog = ACTIVE modules' types; default container id is the top-nav fallback target.
- Name uniqueness is PER-TYPE (`uk_projects_type_name` — the notes/apps defaults may share the "Genel" name).
- `update` guards: default container's type/parent frozen (409 `project_default_immutable`); type change forbidden while content exists (`project_type_change_forbidden`); type activation gate only when the type ACTUALLY changes (a rename of a project whose module went inactive stays allowed — content merely read-only elsewhere); parent change re-validated (404 + cycle 409).
- `assertParentAcceptable`: ancestor chain walked Hibernate-visibly — a soft-deleted mid-chain row ends the walk (a deleted node's frozen parent link cannot be extended by this update, so no cycle through it); depth capped at 50 (`MAX_PARENT_DEPTH`, no unbounded traversal).
- `currentCompany()`: mirrors the Hibernate resolver's `public` fallback for an unset context — the H2 test layout; production always has the filter-set context and no company owns "public" → degrades to `TenantNotFoundException`.

### TaskService
- Task always reached through its owning project; a task of another project is not addressable (404, no leak). Project + assignee existence validated explicitly → clean 404 instead of a DB integrity 500.

### NoteService
- K-44 re-scoped by K-45: flat list = cross-container view (`?projectId=` narrows); creates via nested endpoints or flat path defaulting to "Genel" (`ProjectContainerSupport`). Visibility tenant-wide (`notes:note:read` sees all tenant notes); personal/ABAC notes deferred. Names resolved server-side batched per page (no per-row lookups).
- `FILTER_FIELDS`: `categoryName`/`projectName` correlated scalar subqueries over plain FK columns — soft-deleted references yield null.
- `validateCategory`: category must exist (404) AND belong to the same container (409 `note_category_project_mismatch`).

### NoteCategoryService
- Categories are design-bounded data (a handful per container) → plain paged read + `q` name search.
- Project fixed at create (a move would strand notes in the old container; `projectId` change on update rejected 409). Per-project taxonomy, but name uniqueness stays TENANT-wide for now (cross-container same names are legal siblings).
- `delete`: FK's `ON DELETE SET NULL` never fires (soft-delete is an UPDATE); the soft-delete filter hides the row from reads; notes keep their `categoryId` value and `resolveCategoryName` treats a soft-deleted category as absent (name chip simply disappears).

### CustomAppService
- K-15 / Faz 3.0.B re-scoped by K-45: apps live in APPS-type containers; flat writes default to "Genel"; PUT moves apps between APPS containers. Plan limits (`PlanLimitService`) are TENANT-level (not per container), soft-blocked on create. TOCTOU posture: `existsBy*` pre-check + `DataIntegrityViolationException` constraint-map fallback (RISK-28).
- Property definition validation: SELECT needs non-empty, distinct, ≤100 options, each ≤100 chars, non-blank; RELATION needs an existing target app (UUID) and takes no options; TEXT/NUMBER/DATE/USER take no config; FORMULA rejected outright (deferred, ROADMAP 3.0.B).
- Property type is IMMUTABLE on update (delete + recreate) — existing value rows would not convert.
- `deleteProperty` also bulk-deletes the value rows (dependent data, meaningless once the definition is gone).
- Position semantics: absent on create → append (max+1, first = 0); null on update → keep current (partial-PUT).
- `resolveProjectNames`: batched per page (one query), no per-row lookups.

### CustomAppRecordService
- K-15 EAV path: `t_custom_app_records` + `t_custom_app_record_values(value jsonb)`. Record addressable only through its owning app (nested lookup, 404 on cross-app — same scoping as TaskService).
- Create: required coverage + per-PropertyType validation (`CustomAppPropertyValueValidator`) + per-custom-app plan soft-block.
- PATCH semantics: JSON `null` clears (rejected for required properties), absent keys keep.
- List/get/search responses bulk-fetch value rows (one query per page — no N+1); search delegates to the PG-only `CustomAppRecordSearchExecutor`.

### CustomAppQueryValidator
- Shared by record search (`CustomAppRecordSearchRequest`) and saved view configs (`CustomAppViewConfigDto`) so the two stay in lockstep.
- Eager validation (property existence, operator-vs-type, value shape) → invalid request is 400, never a mid-query 500. Downstream SQL references only validated UUIDs + enum fragments (injection-free).
- Operator/type matrix: TEXT = EQ/NOT_EQ/CONTAINS/IS_EMPTY/IS_NOT_EMPTY; NUMBER/DATE additionally GT/GTE/LT/LTE; SELECT/USER/RELATION = EQ/NOT_EQ/IS_EMPTY/IS_NOT_EMPTY; FORMULA = nothing (deferred). DATE compare takes ISO-8601 date strings. Reserved sort key `createdAt` addresses record creation time.
- FORMULA properties cannot be queried at all.

### CustomAppRecordSearchExecutor
- K-15 / 3.0.B spike outcome: the filter/sort criteria ARE the query DSL — no expression language, no injection surface. SQL assembled exclusively from enum-derived fragments + explicitly numbered `?N` parameters.
- PG-only operators: `@>` containment (EQ), `#>> '{}'` text access, ILIKE (CONTAINS), `::numeric` casts for NUMBER compare/sort (NULLIF guards empty strings), GIN `jsonb_path_ops`-backed. DATE compares lexicographically as ISO text. Verified by gated `CustomAppIT` (real PG); plain record CRUD stays portable under H2.
- Empty-cell semantics: a record with no value row for a property matches only IS_EMPTY/IS_NOT_EMPTY; value operators implicitly require a non-empty cell.
- Runs on the tenant's `search_path` through the multi-tenant EntityManager. `r.created_at DESC` tiebreaker keeps paging deterministic.
- Property-value sorts resolve through a correlated scalar subquery per sort clause.

### CustomAppPropertyValueValidator
- USER/RELATION values get an existence check against tenant data — the JSONB column cannot carry an FK; same rationale as `Task.assigneeId` (plain column + service validation).
- TEXT ≤ 5000 chars (keeps JSONB rows small, rendering cheap); NUMBER must be finite; SELECT must be a configured option; DATE ISO-8601.
- SELECT config guard: a config-less SELECT was never creatable — a missing options array is a corrupt definition, fails loudly.
- `targetCustomAppId` re-checked cheaply at value-validation time: definitions can drift (e.g. target app hard-purged) — a dangling relation must fail loudly.

### CustomAppViewConfigValidator
- View-type anchors: BOARD requires `groupBy` (SELECT property), CALENDAR requires `dateProperty` (DATE property); TABLE/GALLERY/LIST carry neither (rejecting them if sent). Required anchors enforced even when the request carries NO config object at all (null config == empty config).
- Structured JSON only — the deliberate 3.0.B spike outcome: no free-text expression language → no expression-injection surface.

### AuditService
- K-19 layer 1: who (SecurityContext actor id+email), what (action/entity), request metadata (IP + traceId from `RequestContext`).
- REQUIRES_NEW so the write commits even if the audited op rolls back; best-effort (failure logged + swallowed — audit never breaks business). `recordInNewTx` invoked through the self proxy so the flush-at-commit lands inside `record`'s try/catch, not the caller's tx.
- No authenticated principal (startup/provisioning/background) → actor name `"system"`, actor id null.
- Old/new value capture = K-27 "Faz 2b": caller-built JSON (`namesJson` — sorted, escaped, dependency-free) answers "who granted/revoked which permission to whom".
- Test gotcha: REQUIRES_NEW writes commit outside a `@Transactional` test's rollback → assert membership with unique sentinels, never counts.

### AuditQueryService
- K-19 read side: paged views over `t_audit_logs` + `t_login_history`; controller guards with `iam:audit:read`; entity shape kept out of the API contract via response records.
- GET params translated into filter-engine `FilterCriteria` clauses and AND-combined through shared `FilterSpecifications` — no first-match dispatch, filters compose, engine exercised by real traffic.

### LoginHistoryService
- K-19 layer 2: EVERY login attempt recorded (success + failure); failure reason = stable `ErrorCode.code()` (`auth_bad_credentials`, `auth_account_locked`, ...) — uniform client response but stored reason enables brute-force/anomaly forensics (K-27).
- IP/User-Agent from `RequestContext`; null when absent (no web request — bootstrap/test).
- REQUIRES_NEW + best-effort: a failed login (`AuthService.login` throws) still records; a logging failure never breaks auth.

### RequestLogService
- K-19 layer 3 + K-27: `t_request_logs`; REQUIRES_NEW + best-effort.
- 42P01 (undefined table) swallowed quietly — tolerated when the request-log table does not exist yet in a schema.

### RequestLogQueryService
- K-19 layer 3 read side; `iam:audit:read` in the controller. `status` registered as INT (numeric compare, e.g. GTE 400); `requestBody` deliberately unregistered (masked high-risk payload, not a filter target).

### PlatformCompanyService
- K-25 cross-tenant ops on `public.t_companies`. `executeWithoutTenantContext` temporarily clears `TenantContext` — the ONLY sanctioned cross-tenant read path (RISK-18: `platform:*` currently seeded into every tenant's Admin; narrowing open); do not replicate elsewhere.
- `updateStatus` (RISK-32): illegal transitions rejected (e.g. TERMINATED→ACTIVE, ACTIVE→PROVISIONING) — they would leave the tenant in a broken state. Full billing-driven lifecycle in Faz 6.
- `mapToResponse` omits `schemaName` — internal detail, not API contract.

### PlanLimitService
- K-15: limit VALUES live in the code-side `PlanDefinition` registry; `t_plans` stores only reference data (key/rank) → limit changes ship with code, no migration. Enforcement = create-side soft-block (403 `custom_app_limit_reached`); existing data never hidden/deleted.
- `tryActivePlan` = the single plan-resolution chain (K-40): Subscription → `t_plans.key` → registry. Empty in degraded states (no ACTIVE subscription / unknown key) — callers decide (ModuleActivationService shows it in the catalog but rejects activation).
- `activePlan` throws 409 `subscription_not_found` in every degraded state; no tenant context / unknown schema → `TenantNotFoundException`.

### ModuleActivationService
- K-16 flow order: plan gate → module tenant migration → permission seed → activation record LAST (every earlier step idempotent — Flyway history, ensure-permission; partial failure recovered by retrying, the DEBT-10 model).
- RISK-26 FK-deadlock avoidance: public-schema writes (checks, activation record) JOIN the caller's transaction — an activation triggered from provisioning must insert `t_tenant_modules` into the same tx holding the (not yet committed) `Company`, or the FK blocks on the uncommitted parent (self-deadlock on PostgreSQL). Only the permission seed runs REQUIRES_NEW — it writes the TENANT schema and the provisioning outer session is pinned to `public` (schema resolved at session open).
- `activateForCompany`/`resyncForCompany` wrap in a set-and-restore `TenantContext` window (`TenantContextExecutor`) so the REQUIRES_NEW seed + audit write resolve the tenant schema regardless of the caller's context.
- `listModules`: no-subscription tenants still get the catalog with `allowedByPlan=false` (activation itself rejects `subscription_not_found`).
- `ModuleProperties` optional: registered by `ModuleSyncRunner` (`@Profile("!test")`) — tests fall back to built-in default keys.
- K-45 `ensureDefaultProjectInNewTx`: ensures the module's per-type default "Genel"; migration already did it on PG (no-op), this covers re-activation after soft-delete + schemas where the module migration is a no-op. Content-collection types only (NOTES/APPS) — a TASKS default would be meaningless noise; an existing "Genel" of the type is adopted. Same REQUIRES_NEW isolation rationale.
- `resyncForCompany` (ModuleSyncRunner): newly shipped module migrations/permissions propagate to existing tenants; does not touch the activation record.

### TenantSampleDataService
- K-47 Linear-style onboarding: 1 TASKS project + 4 guided tasks, 2 categories + 2 markdown notes, 1 app + 3 properties + 2 views + 4 records (FREE plan limits respected). Fixed EN strings — tenant data, not UI; deliberately no i18n.
- Runs REQUIRES_NEW behind a set-and-restore window (RISK-26 — caller's session is public-pinned); invoked from provisioning's afterCommit so the fresh tx sees the committed activation + subscription rows (read-committed: a same-tx call fails those gates invisibly).
- Fail-safe: `seedForCompany` swallows every exception (warn log) — sample data must never break provisioning.
- Service reuse is safe: authority checks live in controllers (system context cannot 403); `@AuditLog` falls back to the `"system"` actor.
- Flat creates with null projectId land in the default "Genel" NOTES container; the 4th app record carries no stage value (the Board's empty-bucket example).
- Gated by `forgesys.provisioning.sample-data.enabled` (test: false); provisioning-only — existing tenants never touched.

### SubdomainSuggestionService
- K-21: normalize → Turkish-aware ASCII fold (ç/ğ/ı/I/İ/ö/ş/ü) → slugify → pattern validate → availability vs `t_companies`; `-2`/`-3` suffixes up to 3 candidates.
- `isValidSubdomain` keeps the provisioning service self-contained (DTO pattern already constrains requests).

### TenantMigrationSupport
- `migrateModule` (K-16): module migrations at `db/migration/module/{key}` against a module-scoped history table `flyway_schema_history_mod_<key>` — module versions never collide with core versions; each module versions independently from V1. Module locations deliberately OUTSIDE `db/migration/tenant` (recursive scan would swallow them into core history). `flywayLocation() == null` (tables ship in the core tenant baseline, e.g. pm) → no-op.
- `baselineOnMigrate(true)` + `baselineVersion("0")` for MODULE histories: the tenant schema is always non-empty at activation (core tables + core history exist) but the module history table does not exist yet — Flyway demands a baseline there. Baseline 0 records "nothing applied" and skips NOTHING (every module migration V1+ still runs). Contrast: the CORE history intentionally avoids baselineOnMigrate (K-36 — fresh-DB-only since the pre-1.0.0 squash; a baseline would silently skip the baseline family on a non-empty schema).

### List query executors (K-49 family)
- Shared pattern: one Criteria DTO projection (`cb.construct`, no entity hydration) + one count query with the same predicate; batched summary lists resolve in ONE extra query per kind per page. Flatness rule: JOINED targets to-one ONLY, SUBQUERY scalar (a to-many join would multiply rows and silently break paging).
- UserDirectoryQueryExecutor: replaced the former `@Immutable @Subselect` `UserDirectoryView` entity with an in-code projection the filter engine can filter/sort natively (joined columns, count subqueries, membership). Soft-delete semantics ride the joined entities' soft-delete filter (applied to the LEFT JOIN ON) — role/group counts exclude soft-deleted rows.
- GroupListQueryExecutor: fixed 3-query page replacing per-row `findGroupMembers` + `countMembers` (2N+1). Member count starts from `User` (join table owned by `User.groups`). Former native count saw raw join rows; entity-path resolution now filters soft-deleted.
- RoleListQueryExecutor: `permissions`/`parents` stay batched lists (they carry descriptions/full summaries) rather than projection columns; the count subquery keeps `permissionCount` filterable/sortable in-DB.
- NoteListQueryExecutor: `referencedName` — correlated scalar subquery over a plain FK column (K-45 convention: notes/apps hold `categoryId`/`projectId` as UUIDs, not associations); the soft-delete filter applies inside the subquery → soft-deleted ref resolves null. `projectNameOf` reused by ProjectService (self-FK) and CustomAppService.
- PlatformCompanyListQueryExecutor: replaced the unpaged `findAll()` (last K-37 paging violation); runs INSIDE `executeWithoutTenantContext` — cleared context pins the multi-tenant EM to the public schema.

### ProjectContainerSupport
- K-45 shared resolver: `assertProject` (404 unknown / 409 `project_type_mismatch`); `defaultProject` — per-tenant "Genel" ensured by the module V2 migrations + `ModuleActivationService`; shared by notes and apps modules.

### ProjectContentGuard
- K-45: while a container holds content of its current type (tasks pm / notes notes / apps apps — one check per content module), the type is locked (`project_type_change_forbidden`); mixed-content containers are the fragility this decision excludes.

### mail/* (K-21 replacement of `VerificationSender`)
- Port + profile split: `SmtpMailSender` (prod; provider-agnostic — Brevo/SendGrid/SES/plain SMTP all speak `spring.mail.*`; fail-fast on missing host at startup via `@PostConstruct`, fail-loud on send errors — a silently lost signup/reset link is worse than a retryable failure, the caller's tx rolls back; recipients never logged — PII). `LogMailSender` (dev; logs incl. the raw-token action URL — dev-only convenience, same trade-off as the former `LogVerificationSender`). `InMemoryMailSender` (test; `CopyOnWriteArrayList`, cleared per-test).
- Every message template-based (tenant signup, email verification, password reset) — the same channel carries all lifecycle mails.
- `MailLinkBuilder`: `{scheme}://{subdomain}.{host}[:{port}]{path}?token=...` derived from `forgesys.security.app-base-url` (the frontend origin) — the link lands on the tenant's own subdomain so `TenantFilter` resolves the schema when the browser POSTs the token back. Subdomain derived from `tenant_<sub>` (dashes folded to underscores at provisioning); the inverse fold is unique because subdomains reject underscores.
- `MailTemplate` enum: bodies at `mail/<key>.<lang>.html` (tr/en) outside the enum so non-developers can polish copy without a rebuild; subjects stable in code; `infra/templates/` (`templatesDir`) overrides classpath per template.
- `MailTemplateRenderer`: override file first, then classpath; a MISSING override falls through to classpath (a missing file must not silently disable a mail); placeholders are plain `{{token}}` string replacement — deliberately no expression language (template content can never execute code).
- `MailProperties`: `from` (RFC 822; fallback `ForgeSys <no-reply@forgessy.local>` — note the historical "forgessy" typo in the fallback), `defaultLanguage` (tr default until per-user preferences exist), `templatesDir`.
- `MailMessage`: the action URL token is RAW and must never be persisted by the sender (RISK-30).

### exception/*
- `ErrorCode`: wire value = lowercased enum name (`auth_bad_credentials`); clients branch on it — HTTP status and message may evolve, codes stay stable.
- `ApiErrorFactory`: traceId from MDC (populated per request by `RequestMetadataFilter`, honors `X-Request-Id` or generates a UUID); a fresh UUID outside a request thread so the field is never null.
- `BusinessException` hierarchy lives in backend (references Spring HTTP types — forbidden in the Spring-free `common` module); cross-module exceptions (e.g. `TenantNotFoundException`) stay plain `RuntimeException`s translated by the handler. Direct throws with a specific code (e.g. `USER_EMAIL_TAKEN`) are legal for one-off rules.
- `ApiErrorResponse`/`ApiFieldError`: uniform shape for controller advice + security entry point/access denied handler + tenant filter; sensitive rejected values sanitized before exposure.
