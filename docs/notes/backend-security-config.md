# Backend security & config notes ("why" stories)

> Moved out of source comments. Index: [docs/CODE_NOTES.md](../CODE_NOTES.md) · rules: [backend/AGENTS.md](../../backend/AGENTS.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md)

## backend/security — backend/config

### SessionRevocationService
- Privilege-retention window rationale: authorities are embedded in the access token at
  issue time, so a role/permission/group mutation otherwise keeps affected tokens
  authoritative until the next issue (login/refresh) — up to the token TTL. The stamp +
  refresh-drop closes that window: revoked permission enforced on the very next request.
- Dropping refresh tokens matters because a stolen refresh could otherwise mint a fresh
  access token whose `iat` post-dates the revoke.
- Caller responsibilities split: `revokeRoleHolders`/`revokeGroupMembers` resolve *who is
  affected*; or explicit ids via `revokeUsers`.
- Bulk access-token stamp = one conditional UPDATE (`UserRepository.bulkSetTokenInvalidBefore`);
  refresh revoke is per-user (Redis) because the store is keyed per user.
- `revokeUsers`: refresh revoke only fires when a tenant is bound — the refresh store is
  tenant-scoped.
- `invalidateAccessTokens`: used by single-session admin revoke — the targeted device's own
  refresh token was already dropped, so the stamp signs it out on next request; siblings
  recover automatically via silent refresh (momentary blip, not a sign-out).
- `resolveRoleHolderIds`: post-soft-delete, the soft-delete filter hides the role and the lookup
  returns nobody; deferring revoke until after the last-admin guard means a rejected delete
  leaves no Redis-side revoke behind.
- `revokeAllPermissionsRoleHolders`: outstanding tokens embed the prior permission snapshot;
  all-permissions users should "hear about" a created/renamed permission rather than wait
  for TTL. No-op when no role carries the flag.
- `enforceSessionLimit` (Faz 5): implemented with the existing K-28 primitives
  (`RefreshTokenStore.listSessions`/`revokeSession`) — no store-contract change. Evicted
  device's short-lived access token is left to expire at TTL (session-cap eviction, NOT an
  admin remote-revoke — deliberately does not stamp `tokenInvalidBefore`). Login always
  succeeds; cap `<=0` = unlimited.

### JwtAuthenticationFilter
- Tenant binding (RISK-19) detail: token minted for tenant A replayed against tenant B =
  cross-tenant privilege escalation; rejected by clearing the context (→ 401). When the
  request carries no tenant (exempt/public paths), both sides normalize to `"public"`.
- Decode failure (bad signature/expired/malformed) → context cleared, request proceeds
  unauthenticated; protected routes get the uniform 401 from `RestAuthenticationEntryPoint`.
- `tokenInvalidBefore` is read via a single-column projection — no JOIN, no lazy proxy.
  Per-request cost: one small indexed query + one Redis lookup.
- Semantics of `isRevokedByTokenInvalidBefore`: narrow reject case = a present
  `tokenInvalidBefore` strictly after the token's issued-at second; absent row / null
  column / missing `iat` all accept. Full NumericDate-vs-timestamptz story: `iat` is
  seconds, the stamp keeps nanos; truncating the stamp to seconds means only a token
  whose iat SECOND is strictly earlier than the revoke second is rejected (protects
  fast re-login after password change).
- Token extraction order: cookie first (browser sessions), then `Authorization: Bearer`
  (API clients, cURL, jobs).
- Cookie preference is path-scoped (0.2.1 regression fix): the platform access cookie wins
  only on `/api/v1/platform/**`, the tenant cookie everywhere else. K-50 originally set the
  platform access cookie on `Path=/` (only the refresh cookie was path-scoped), so a browser
  holding both sessions sent both cookies on tenant paths; the filter's then-unconditional
  platform precedence validated the platform token instead of the tenant one and the
  scope-vs-tenant-context check hard-rejected → login returned 200 but `/users/me` 401'd
  forever. `PlatformAuthProperties.buildAccessTokenCookie` now scopes BOTH cookies to
  `/api/v1/platform`, and the path-aware precedence heals browsers still carrying the legacy
  `Path=/` cookie. `PlatformAuthController.logout` expires both path variants. Regression
  lock: `PlatformCookiePrecedenceTest`.

### CustomUserDetailsService
- `loadUserByUsername` is the `UserDetailsService` contract; `resolveAuthorities` is shared
  with `AuthService` at login.
- Why query-driven (history): the previous entity-graph walk depended on nested lazy
  collections (`group.roles` → `role.permissions` → `role.parentRoles`) initializing through
  `findByEmail` (no fetch graph) — fragile and an N+1 source; a full fetch graph is
  impossible (Hibernate multiple-bags limit). Explicit `UserRepository` queries sidestep both.
- Parent closure: BFS over `t_role_parents` until stable; the seed set doubles as the
  visited set so a malformed inheritance cycle (which `RoleService.setParents` already
  prevents) cannot infinite-loop.
- All-permissions short-circuit (checked AFTER the closure): built-in Admin (seeded with
  the flag) and any user-defined "ALL" role implicitly hold every permission, including
  runtime-created ones, with no `t_role_permissions` row per permission. Because the check
  is post-closure, a role that transitively inherits from an all-permissions role is itself
  treated as all-permissions.
- Permission wire format `{module}:{resource}:{action}`, sorted for stable display.
- `effectiveRoleIds` is the shared seed for both authority resolution and the
  effective-permissions view; inactive groups excluded so deactivation drops permissions.

### SecurityConfig (config/)
- Pepper rationale (K-23): a DB leak alone cannot brute-force hashes — the pepper lives
  outside the DB (env var / secret manager, `forgesys.security.password-pepper` /
  `PASSWORD_PEPPER`). BCrypt strength 12 (RISK-13). Legacy pepper-less hashes still
  validate and lazily rehash on next successful login. test/dev profiles ship a
  non-secret default; blank fails startup fast.
- `/api/v1/auth/**` public subset = tenant signup + login; everything else authenticated.
- K-41 full story: unconditional permitAll of `/v3/api-docs/**` + swagger is safe because
  prod disables springdoc outright (endpoints don't exist → 404); dev/test keep them for
  developers.
- K-43 full story: `/actuator/prometheus` unauthenticated in the dev/test same-port layout —
  carries only numerical system metrics (JVM/HTTP/tenant count), no PII/secrets. Prod moves
  management endpoints to their own port (`management.server.port`, application-prod.yaml)
  running WITHOUT this filter chain (child context) and never published off-host (compose
  exposes it on the internal network only) — the matcher is a no-op there.
- TenantFilter ordering story: runs before the security chain (security order -100) so
  tenant context is resolved for every request before the JWT auth filter executes; the
  explicit `FilterRegistrationBean` also suppresses the bare `@Component`'s default
  low-precedence auto-registration (same for RequestMetadataFilter).
- RequestLogFilter ordering story (regression history): the `t_request_logs` write happens
  in the filter's `finally`, which unwinds BEFORE the security/tenant/metadata filters
  clear their ThreadLocals — so tenant schema, authentication and request metadata are
  live at write time. Registered outside the chain on bare `@Order` once, the write landed
  in `public` with null user/trace, every insert failed and the swallowed 42P01 left the
  request-logs screen empty (regression-locked by `RequestLogFilterChainTest`).
- RequestMetadataFilter (-102): trace id, client IP and User-Agent available to every
  downstream filter/service; error responses carry a stable trace id.
- RequestBodyCaptureFilter (-94): wraps mutating high-risk requests with a cached body and
  publishes the masked body to `AuditRequestContext` BEFORE delegating, so both
  `AuditLogAspect` (during the request) and `RequestLogFilter` (in its finally) consume it.
- Filter order map: RequestMetadataFilter -102 → TenantFilter -101 → security chain -100 →
  RequestLogFilter -95 → RequestBodyCaptureFilter -94. RateLimitFilter sits before
  JwtAuthenticationFilter INSIDE the chain.

### RefreshTokenStore
- Tenant isolation: a session records its tenant schema; the caller validates session
  tenant vs request tenant so a token minted in tenant A cannot be refreshed in tenant B
  (mirrors RISK-19 access-token binding).
- Session model (K-28): stable `sessionId` + device metadata (IP / User-Agent / loginAt /
  lastSeen); `activeSessionFor` resolves the session behind a presented token so the
  service can flag the caller's current device. The store owns only refresh tokens —
  `SessionService` additionally stamps `tokenInvalidBefore` on revoke so the device's
  outstanding access token dies immediately, not at TTL.
- `listAllSessions` implementation: enumerates the tenant's per-user indexes (Redis SCAN /
  InMemory prefix scan), aggregates `listSessions` per user; bounded by the number of
  active refresh tokens (each expires); admin-only occasional read.

### RedisRefreshTokenStore
- Record contents: state/userId/email/tenant + K-28 session metadata
  (sessionId/ipAddress/userAgent/loginAt/lastSeen). Key formats:
  `refresh:tok:<sha256>`, index set `refresh:idx:<tenant>:<userId>` (backs
  `revokeAllForUser` + `listSessions`). TTL = refresh-token lifetime.
- Rotation Lua semantics: only an ACTIVE token flips to ROTATED and returns metadata;
  a ROTATED token reports REUSE — closes the read-modify-write race of two concurrent
  refreshes. Stable `sessionId` + original device metadata preserved; only `lastSeen`
  advances. Script returns flat list: {OK/NIL/REUSE, then payload fields}.
- RISK-36 full story: `issue` is the only fail-closed path — a token that could not be
  stored must not be handed out (exception propagates → 503 `service_unavailable`).
  Rotate degrades to `Unknown` (clean 401, no 500); session list/revoke reads return
  empty/false best-effort. Recovery automatic once Redis returns.
- `revoke` chain-following: a ROTATED record's `rotatedTo` successor is the live token of
  the SAME session (rotation preserves sessionId); not killing the successor would leave
  the session surviving logout and showing ACTIVE to admins.

### InMemoryRefreshTokenStore
- Mirrors the Redis state machine (ACTIVE→ROTATED, reuse detection, per-user index) in
  plain concurrent maps so the default H2 suite exercises rotation/reuse and session
  listing/revoke without a Redis container.
- TTL/expiry deliberately not enforced here — verified against real Redis by the gated
  `RedisRefreshTokenIT` (`-Dforgesys.redis.it=true`).

### LastAdminGuard
- Root cause closed: an admin could soft-delete/disable themselves, strip their own admin
  role, or delete/degrade the last admin-capable role/group → tenant with zero
  admin-capable users, no in-product recovery (platform-level rescue is deliberate future
  work) — prevention is the only defense.
- Admin-capable definition mirrors `CustomUserDetailsService` authority resolution with the
  direction reversed: flag roles are expanded DOWNWARD through `t_role_parents` (children
  of an admin role are admin-capable) before checking for holders. "Admin" the NAME is
  only a seed convention; a specific permission is NOT the test.
- Invariant detail: non-deleted AND `enabled=true` (the soft-delete filter hides soft-deleted
  users; disabled admins don't count).
- Usage mechanics: the existence query is JPQL → Hibernate auto-flushes pending entity
  changes (removed role/group join rows, `enabled=false`, soft-delete UPDATE) before it
  runs; violation throws `LAST_ADMIN_REQUIRED` (409) rolling the whole mutation back.
- `assertNotSelf` throws `SELF_DELETE_FORBIDDEN` (409) when target matches the
  authenticated principal; self-delete is never necessary.

### PepperingPasswordEncoder
- OWASP-recommended pepper strategy for BCrypt (BCrypt has no native pepper). 32-byte
  HMAC → 44 Base64 chars, well under BCrypt's 72-byte input limit.
- Hash formats: legacy pepper-less `$2a$12$...` from the pre-K-23 `BCryptPasswordEncoder(12)`
  bean (RISK-13 lineage); peppered `{sf-peppered}$2a$12$...`. `matches` detects the marker;
  `upgradeEncoding` true on legacy → login flow rehashes (lazy migration, same philosophy
  as RISK-13 strength upgrades).
- Pepper rotation deliberately unsupported: a change invalidates every peppered hash
  (legacy hashes would still verify then rehash to the new pepper); a dedicated migration
  flow would be needed.
- Pepper must be non-blank (Assert); held outside the DB.

### JwtTokenProvider
- Claim set: sub=userId, jti (unique per token — granular blacklist target, K-34),
  email, tenant (schema), authorities (resolved permission strings), iss/iat/exp.
- Tenant claim omitted keeps the builder happy when no tenant was resolved (login always
  resolves one via subdomain).

### JwtConfig
- Shared KeyPair bean so encoder and decoder always agree; RsaKeyProperties +
  JwtCookieProperties enabled here.
- RISK-14: resource-server auto-config filter NOT enabled — the custom
  `JwtAuthenticationFilter` handles decoding + context population so revocation
  (`tokenInvalidBefore` / Redis blacklist) could be layered on.

### JwtCookieProperties
- Property list: cookieName / refreshCookieName (keys); cookieSecure / refreshCookieSecure
  (dev/test false HTTP; prod forced true by application-prod.yaml, RISK-24 — cleartext
  leakage over HTTP downgrade / mixed content); cookieSameSite (default Lax);
  refreshTokenTtlDays (default 7 — drives Redis TTL + refresh-cookie Max-Age);
  refreshCookiePath (default `/api/v1/auth` so the cookie is only sent to auth endpoints).
- `jwt.*` prefix; the `jwt.rsa.*` subkeys are owned by `RsaKeyProperties` and ignored here
  (record has no matching field).
- K-40: the build/expire/read helpers are the single cookie construction path shared by
  the auth and session controllers — controllers never assemble `ResponseCookie`s
  themselves. Resolved-with-defaults so callers/tests never see nulls.

### RsaKeys
- `resolve(failIfUnconfigured)`: true (prod) throws IllegalStateException fail-fast — an
  unconfigured prod deployment must not silently start on an ephemeral key (tokens
  wouldn't survive restart; multi-instance clusters would each mint under different
  keys → random 401s) [RISK-23]. False (dev/test) generates ephemeral 2048-bit with a
  warning so local dev/tests need no cert files.

### RsaKeyProperties
- Loaded from externalized config (e.g. `certs/*.pem` in prod); when neither PEM is set,
  `JwtConfig` falls back through `RsaKeys.resolve`. Keys NEVER committed (AGENTS
  "Never" rule).

### TokenHasher
- Raw token only ever lives in its delivery channel (email link, cookie, response body);
  every persisted form (DB column or Redis key/value) carries the digest, so a store/backup
  leak cannot replay it (K-34 refresh + RISK-30 verification tokens). Lowercase hex matches
  PostgreSQL `encode(sha256(x), 'hex')` (public V3 backfill); replaced former per-store
  private copies.

### TokenBlacklistService
- On per-session logout the current access token's `jti` is blacklisted with TTL = token's
  remaining lifetime; `JwtAuthenticationFilter` rejects it (→ 401) without waiting for
  expiry. Complements user-scoped `tokenInvalidBefore`.

### RedisTokenBlacklistService
- Fail-open reasoning: blacklist is defense-in-depth on top of signature + expiry +
  `tokenInvalidBefore` (RISK-21); a skipped blacklist write simply expires with the
  token's TTL; a failed read's exposure window is bounded by the short access-token
  lifetime. A Redis blip must not 500 every authenticated request or break logout.

### InMemoryTokenBlacklistService
- `jti → expiry-millis`, pruned on read — enough for the H2 suite to exercise per-session
  logout without a Redis container.

### CustomUserDetails
- Two construction paths: `CustomUserDetailsService` from the DB at login (real account
  flags + resolved authorities); `JwtAuthenticationFilter` from claims per request
  (account flags assumed valid for the short-lived token).
- RISK-22 full story: the lockout writes `lockedUntil` only; `accountNonLocked` column
  stays true. Without the effective-locked check, a locked account with a live refresh
  token could keep minting fresh access tokens via `/auth/refresh` for the whole lock
  duration (access tokens are killed via `tokenInvalidBefore`, but refresh immediately
  reissues). Lock expiry lazy: past `lockedUntil` counts non-locked; login clears it.
- `getJti` used by per-session logout to blacklist the single token; null on login-time
  principals (before a token exists).

### RateLimitFilter
- Closes the credential-stuffing paths the per-account lockout (RISK-22) misses: one IP
  guessing across many accounts, and unknown-email attempts that never increment any
  account's lockout counter.
- Registered inside the Spring Security chain before `JwtAuthenticationFilter` so a
  blocked request never reaches the controller. Scope derived from the request path
  (login / company-verify / verify-email / forgot-password / reset-password / refresh).
- Master switch `forgesys.security.rate-limit.enabled` disables wholesale.

### RateLimiter
- Bucket key example: `rl:login:tenant_acme:10.0.0.1`. Capacity = burst, then steady
  refill. Params per call so one limiter serves endpoint profiles with different limits.

### RateLimitProperties
- `enabled` also usable to bypass in tests that hammer auth endpoints. Stricter
  per-endpoint profiles are a K-XX follow-up; the uniform profile closes the
  credential-stuffing gap at the request edge.

### RedisRateLimiter
- Lua script mirrors the refresh-rotation Lua pattern in `RedisRefreshTokenStore`; closes
  the read-modify-write race two concurrent requests from the same key would otherwise open.
- Bucket TTL 600s (slightly above the refill window) so idle keys expire.

### InMemoryRateLimiter
- ConcurrentHashMap of `[tokens, lastRefillEpochSec]` pairs; refill/consume math identical
  to the Lua script; real Redis atomicity verified on the dev/prod path.

### RestAuthenticationEntryPoint / RestAccessDeniedHandler
- Replace Spring Security defaults (login redirect / 403) with the uniform
  `ApiErrorResponse` shape (401 `auth_unauthenticated` / 403 `auth_access_denied`).

### ActiveSession / RefreshSession / RotationResult / IssuedRefresh (refresh/)
- ActiveSession vs RefreshSession: the lean RefreshSession carries only what
  `AuthService` needs to re-resolve a user on rotation; ActiveSession carries device
  metadata for the UI list. Param semantics: sessionId stable per device (preserved
  across rotation); loginAt = first issue (preserved); lastSeen = most recent rotation
  (equals loginAt until rotated); ipAddress/userAgent nullable (tests/unknown). `current`
  flag set by the service layer matching the caller's presented refresh token.
- RotationResult is sealed so callers handle every case; ReuseDetected caller duty:
  `revokeAllForUser` + stamp `tokenInvalidBefore` so outstanding access tokens die too.
- IssuedRefresh: raw opaque token (URL-safe Base64, 32 bytes entropy) handed to the
  client via cookie/body; store keeps only the SHA-256 hash.

### ModuleDefinition (config/)
- Replaces a `t_module_catalog` DB table ON PURPOSE: a module is code (entities, services,
  migrations) so the registry entry must ship with the code and cannot drift.
- Field semantics: `ownMigrations=false` means tables already ship in the core tenant
  baseline (true for `pm`, whose tables predate the module system); `projectType` (K-45)
  — the creatable type catalog derives from the tenant's ACTIVE modules, null = no
  container-facing type; `permissions` seeded into `t_permissions` on activation and
  re-synced at startup for activated modules.
- APPS (K-15 / Epic 3.0.B): first ownMigrations=true module; adoption is the point of
  minPlan=FREE.
- NOTES (K-44 / Epic 3.2): per-module history `flyway_schema_history_mod_notes`; no plan
  limits (pm convention); `notes:note:read` sees all tenant notes.

### RbacSeeder (config/)
- Runs at startup iterating `t_companies`, switching TenantContext per tenant (mirrors
  TenantMigrationRunner); also invoked by `TenantProvisioningService.createAdminUser` so a
  brand-new tenant is seed-complete before the request returns. Disabled in test (fixtures
  built manually).
- Privilege-escalation fix history (2026-08-16): auto-assigning Admin to role-less users
  silently elevated deliberately unprivileged users to full admin on EVERY restart.
- `seedForCurrentTenant` is @Transactional and called through the Spring proxy
  (ObjectProvider self-proxy) from `run` and from provisioning — keeps the session open
  for lazy collection initialization (`Role.permissions`, `User.roles`).
- Admin role description: "Full administrative access (implicit all-permissions role)";
  all_permissions resolved dynamically by CustomUserDetailsService.

### PlanSyncRunner (config/)
- K-16 / Epic 3.0.A; disabled in test (tests build plan fixtures manually). Order 0
  because SystemAdminBootstrapRunner (tenant provisioning writes a subscription) and
  ModuleSyncRunner (subscription backfill) depend on the plan rows existing.

### ModuleSyncRunner (config/)
- FREE backfill preserves the pre-3.0.A behavior where every tenant had every module;
  default keys ensured ACTIVE idempotently (pm backfills every existing tenant); re-sync
  propagates newly shipped module migrations/permissions to existing tenants. Disabled in
  test (ModuleActivationService falls back to built-in default keys there).

### SystemAdminBootstrapRunner / SystemAdminBootstrapProperties (config/) — K-50 ile KALDIRILDI
- K-24: gave the platform a stable privileged identity without manual signup; used for platform operations and as a service account for M2M/job outbound calls. The RBAC seed and the explicit Admin grant happened inside `createAdminUser` during provisioning — the runner intentionally only performed tenant + admin provisioning. Disabled in test.
- `provisionSystemTenant` = createPendingCompany + verifyAndProvision back-to-back (K-21 two-phase flow) with verification mail suppressed.
- **K-50 ile kaldırıldı** (2026-08-26): `SystemAdminBootstrapRunner` + `SystemAdminBootstrapProperties` + `provisionSystemTenant` silindi; mevcut `system` tenant DB satırı dokunulmadan bırakıldı. Yerine platform kimlikleri (`public` şeması) + `PlatformAdminBootstrapRunner` (K-50).

### SchedulingConfig (config/)
- First @Scheduled consumer: TokenPurgeJob (RISK-30 stale verification-token purge).

### TokenPurgeJob (config/)
- Purges both token families: public `t_tenant_verification_tokens` + per-tenant
  `t_auth_tokens` (email verify / password reset). Cutoff columns `used_at`/`expires_at`.
- Signup purge runs through the `self` ObjectProvider proxy (same pattern as
  TenantProvisioningService.createAdminUser): @Scheduled entry point and transactional
  worker in one class without a self-invocation trap.

### OpenApiConfig (config/)
- Spec at /v3/api-docs, UI at /swagger-ui.html in dev/test. The httpOnly cookie is
  attached automatically by the browser; JS never reads it. To try authenticated
  endpoints from Swagger UI: call /auth/login first in the same browser session
  (cookies flow same-origin) — or use a tenant subdomain host plus the dev-only
  X-Tenant-ID header when hitting localhost directly.

### CorsConfig (config/)
- Origins comma-separated via `forgesys.security.cors.allowed-origins`; default covers the
  Vite dev server (5173 + 3000 in yaml).

### MultiTenancyJpaConfig (config/)
- AuditorAware closes RISK-33/RISK-3: created_by/updated_by = authenticated user id,
  "system" fallback when unauthenticated (signup, provisioning, startup runners).
- DateTimeProvider returns UTC OffsetDateTime (RISK-15).

### SampleDataConfig / SampleDataProperties (config/)
- K-47: unlike runner-bound properties (ModuleProperties is registered by a !test
  runner), TenantSampleDataService is a plain service whose bean exists in the test
  context too — hence registered in EVERY profile; the test yaml flips the flag to false.
  A disabled flag simply leaves new tenants empty.

### ModuleProperties (config/)
- Default-keys semantics: activated at provisioning + backfilled at startup for
  pre-module-system tenants; unknown keys logged + skipped by consumers.

### TenantMetrics (config/)
- JVM/HTTP/system series come from Micrometer auto-configured binders; active tenant
  count is the only business number meaningful per-process. Per-tenant gauges would need
  a labeled push design, not a scrape-time gauge. One lightweight K-40 TenantSchemaView
  projection query (no entity hydration) per scrape.

### PermissionCatalog (config/)
- Names follow `{module}:{resource}:{action}`. iam:* enforced by @PreAuthorize on RBAC
  controllers; platform:* reserved for the system tenant admin on `/api/v1/platform/**`.
- CORE drives only the always-present rows in t_permissions; module permissions reach the
  Admin role automatically once seeded on activation (all_permissions).

### PlanDefinition (config/)
- Until Faz 6 the t_plans rows are reference data gating module activation only.
- FREE=0 / PRO=1 / ENTERPRISE=2; limits: maxCustomApps 3/25/-1, maxRecordsPerCustomApp 1k/50k/-1.

> **Kayda değer bulunmayıp yalnızca silinenler** (security/config taraması): runner
> javadoc'larındaki tekrarlı "startup'ta iterates/try-catch" kalıpları; record `@param`
> tekrarları; cron'u tekrar eden "03:00 off-peak"; eski faz konuşması ("Chunk C/D").
