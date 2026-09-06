# Backend web/audit/controller/DTO notes ("why" stories)

> Moved out of source comments. Index: [docs/CODE_NOTES.md](../CODE_NOTES.md) · rules: [backend/AGENTS.md](../../backend/AGENTS.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md)

## backend/web — backend/audit — controller/dto/tenant

### FilterFieldSet

- K-49 filter engine: per-feature whitelist of filterable/sortable attributes.
  Only declared fields are reachable from the wire — the defense against
  filtering through relations or leaking internal fields. Wire names stay FLAT
  (`a.b` nested paths are structurally unreachable; SortGuard rejects them).
- Registration uses JPA canonical metamodel String constants (e.g.
  `User_.EMAIL`): a renamed entity field breaks the build instead of silently
  opening a stale/absent field.
- Same set doubles as the sort whitelist (`SortGuard.require(pageable, fields)`)
  — one source of truth per feature.
- Four registration kinds:
  - DIRECT — attribute of the root entity (wire name == attribute name).
  - JOINED — attribute of a to-one LEFT JOIN of the root (e.g. user's
    `firstName` via `userProfile`). To-many not registrable by design.
  - SUBQUERY — derived scalar (counts over plural associations, name-resolution
    through plain FK UUID columns) via `SubqueryExpression`; used in WHERE,
    ORDER BY and SELECT; must stay scalar.
  - MEMBERSHIP — collection contains (`roleIds IN [...]`, `IS_NULL` = empty
    collection) via correlated EXISTS; filter-only, never sortable, values are
    member ids. Two forms: `direct` (correlates a plural association of the
    root) and `inverse` (join table owned by the other side, e.g. a group's
    members live in `User.groups`; EXISTS starts from the member entity and
    correlates back through its association by link id).
- Flatness rule: JOINED only to-one, SUBQUERY scalar — a to-many join would
  multiply rows and silently break paging counts. Collection data goes through
  SUBQUERY/MEMBERSHIP.
- Builder invariants: searchable fields must be STRING-typed (q is a
  case-insensitive containment over text).

### FilterSpecifications

- Translates global `q` (optionally narrowed to `qFields`) + `FilterCriteria`
  clauses into one Specification: filters AND-joined; `q` OR-CONTAINS over
  registered searchable fields (or the selected subset when `qFields` given).
- All validation is eager at build time — invalid request fails 400
  `validation_error` before any query runs, never a mid-execution 500.
- `MAX_IN_VALUES = 100` — bounds generated SQL for IN/NOT_IN clauses.
- Arity: EQ/NOT_EQ/GT/GTE/LT/LTE/CONTAINS/STARTS_WITH/ENDS_WITH exactly 1,
  BETWEEN exactly 2, IN/NOT_IN 1..100, IS_NULL/IS_NOT_NULL 0.
- Membership predicates: correlated EXISTS; direct form correlates the root
  association, inverse form starts from the member entity. Correlated joins
  apply the member entity's soft-delete filter, so soft-deleted members are
  excluded — semantics match what the associations resolve to elsewhere.
- `likeIgnoreCase`: column lowered by DB, pattern lowered with
  `Locale.ROOT` in Java. Assumes DB lower() folds ASCII the same way — true for
  en-locale PostgreSQL and for the H2 test JVM (surefire `user.language=en`
  argLine pin; a Turkish-locale JVM would turn `lower('I')` into `'ı'` and
  break case-insensitive search on H2).
- `escapeLike` escapes `% _ \` so user input matches literally (escape char
  passed to `cb.like`).
- `comparablePredicate`: the unchecked casts pin one `Y` for the whole
  expression/value pair, resolving the CriteriaBuilder overload ambiguity;
  values were parsed to the field's declared type by FilterValueParser, so
  erasure keeps them type-correct at runtime.

### FilterValueParser

- Parses wire strings per the field's `FilterFieldType` (STRING / UUID /
  BOOLEAN / TEMPORAL (OffsetDateTime) / DATE (LocalDate) / NUMERIC (Long) /
  INT (Integer) / ENUM (Enum.valueOf)).
- Every parse failure is 400 `validation_error` naming the field — an
  unparseable value must never surface as 500 or silently match nothing
  ([RISK-29] semantics).

### FilterOperator

- 14 operators: EQ, NOT_EQ, IN, NOT_IN, CONTAINS, STARTS_WITH, ENDS_WITH, GT,
  GTE, LT, LTE, BETWEEN, IS_NULL, IS_NOT_NULL. Wire value = enum name.
- `TRUE`/`FALSE` pseudo-operators deliberately absent — EQ on a boolean covers
  them with one code path.

### FilterFieldType

- Kept intentionally small; new kinds arrived with the first attribute that
  needed them: NUMERIC with `RequestLog.durationMs`, DATE with `Task.dueDate`,
  INT with `RequestLog.status`. ENUM carries `null` default java type (per-
  field enum class supplied at registration; unknown names → 400, not silently
  unmatched).

### SearchRequests

- Maps a SearchRequest body onto a Pageable and runs the sort through
  SortGuard against the feature's FilterFieldSet — POST /search bodies get the
  same whitelist treatment as GET lists, so no property-path injection path
  exists on either surface. Page/size bounds enforced upstream by Bean
  Validation on the DTO. DEFAULT_SIZE = 20 (matches the GET default).

### SortGuard

- Without a whitelist a client can order by any resolvable property path
  (e.g. nested `userAccount.tokenInvalidBefore`) — leaks internal model shape
  AND bypasses the unknown-property `PropertyReferenceException` guard (a
  nested path that EXISTS resolves fine at the repository layer).
- Whitelist entries are metamodel constants (`User_.EMAIL`,
  `AuditEntity_.CREATED_DATE`) — renames break the build, not the wire.
- Order-insensitive; violation → 400 `validation_error` listing the sortable
  names (membership fields are never sortable via the `sortable` flag).

### ProjectionListQuery

- K-49 shared Criteria DTO projection executor: one content query
  (`cb.construct` — rows are DTOs, never managed entities: no hydration
  overhead, no N+1, no dirty checking) + one count query with the same
  predicate. Sort properties resolve through the feature's FilterFieldSet so
  joined/subquery columns sort in the DB like direct ones.
- Flatness rule: registrations may JOIN only to-one (LEFT) and keep subquery
  fields scalar — a to-many join would multiply rows and silently break both
  paging and the count query. Collection data goes through scalar subqueries /
  EXISTS (mirrors the former `UserDirectoryView` read model).
- SortGuard runs at the controller layer; a non-registered/non-sortable
  property here throws IllegalArgumentException as the last line of defense.

### RequestMetadataFilter

- Order -102 (tenant -101, security -100): runs before everything so error
  responses produced downstream carry a stable trace id. No `shouldNotFilter`
  — metadata is useful for every path incl. actuator/public auth.
- Trace id: `X-Request-Id` header when present AND matching
  `^[A-Za-z0-9._-]{1,128}$` (bounded/safe charset prevents MDC/log forging);
  otherwise a fresh UUID.
- Client IP: `X-Forwarded-For` first hop → `X-Real-IP` → `getRemoteAddr()`.
  Forwarded headers trusted because prod runs behind a trusted reverse proxy
  (K-33 topology).
- User-Agent truncated to 500 chars (matches `t_login_history.user_agent` /
  adjacent audit column limits).
- RequestContext + MDC cleared in `finally` — no ThreadLocal leak across
  reused request threads.

### RequestBodyCaptureFilter

- Order -94, registered INSIDE the security chain after RequestLogFilter
  (-95). Wraps mutating requests (POST/PUT/PATCH/DELETE) on high-risk paths
  with a cached body and publishes the MASKED body to AuditRequestContext
  BEFORE delegating — AuditLogAspect peeks it during the request and
  RequestLogFilter consumes it in its finally (the single clear point).
- Default high-risk paths (`forgesys.audit.high-risk-paths`):
  /api/v1/users/**, /roles/**, /groups/**, /permissions/**, /platform/**,
  /modules/**, /apps/**.
- Default mask key substrings (`forgesys.audit.mask-patterns`, lowercase,
  substring match): password, token, secret, credential, authorization,
  apiKey, accessKey, clientSecret → value replaced with `[REDACTED]`.
  Masking recurses into nested maps and lists; unparseable body →
  `[MASKING_FAILED]`; body fully read at wrap time so masking needs no
  response data.

### RequestLogFilter

- Order -95, INSIDE the security chain (after the security
  DelegatingFilterProxy at -100): the write happens in this filter's finally,
  which unwinds BEFORE the security/tenant/metadata filters clear their
  ThreadLocals — tenant schema, authentication and request metadata are still
  live when the `t_request_logs` row is written. (History: bare
  `@Order(HIGHEST_PRECEDENCE + n)` once placed these filters outermost; the
  write landed in `public` with null user/trace and the swallowed 42P01 left
  the request-logs screen empty — regression-locked by
  RequestLogFilterChainTest. Do NOT move them outside the chain.)
- Skips the write when no tenant was resolved (actuator, tenant signup,
  unknown host): `t_request_logs` exists only in tenant schemas, an insert
  would land in `public` and fail.
- Single clear point for AuditRequestContext — the masked body never leaks to
  the next request on a reused thread.
- Requests rejected inside the security chain itself (401 before -95) are not
  logged — failed logins are covered by `t_login_history`.

### RequestContext / RequestMeta / AuditRequestContext

- RequestContext mirrors the common `TenantContext` ThreadLocal pattern but
  lives in the backend module: only the web layer writes it, only backend
  services read it. Common-module rule — a type belongs in `common` only when
  shared by more than one module.
- Only the trace id is logged; client IP / User-Agent are PII and never logged.
- AuditRequestContext: body is PEEKED by AuditLogAspect (get, not
  get-and-clear — consuming there would leave the request-log row without its
  body; the value must survive until RequestLogFilter's finally).

### AuditLogAspect

- `@Around` on `@AuditLog`: proceeds first (no audit when the business op
  throws), builds a SpEL StandardEvaluationContext (method params by name +
  `#result`), evaluates entityId/entityName, delegates to AuditService through
  an ObjectProvider self-proxy so the REQUIRES_NEW boundary is honored.
- Audit failures are caught and logged at warn — audit logging never breaks
  the business op.
- Test hook (`setTestHook`/`clearTestHook`) lets unit tests capture audit calls
  without a Spring context.

### AuditLog (annotation)

- Usage example:
  `@AuditLog(action = "user_created", entityType = "User", entityId = "#result.id", entityName = "#result.email")`
- `captureDelta = true` for privilege changes (role/group/permission
  assignments): `oldValue`/`newValue` SpEL expressions evaluate to before/after
  name collections (e.g. `#beforeRoleNames` / `#afterRoleNames`); the caller
  must place those variables in the evaluation context.

### Controllers (shared pattern)

- Every list controller repeats: GET list (bookmarkable `?q=`/`?qFields=` +
  Spring Data sort through SortGuard) + `POST /{resource}/search` (full
  SearchRequest filter-engine body, same read permission). The 1-line
  "filter-engine variant" javadoc on each /search method refers to this.
- AuthController: register returns 202 (PROVISIONING company — resource not
  ready, not 201); verify is the synchronous heavy phase (CREATE SCHEMA +
  Flyway + admin user); forgot-password ALWAYS 200 (no enumeration); logout =
  per-session (consume refresh + blacklist jti; user-scoped
  tokenInvalidBefore reserved for password change/reset/reuse).
- UserProfileController: literal `me` segment takes precedence over the
  `/{id}` variable in UserController (Spring MVC literal-beats-variable).
- UserSessionController: self scope (`/users/me/sessions`, any authenticated
  user; current device flagged via the `sf_refresh_token` cookie) vs admin
  scope (`/users/{id}/sessions`, `iam:user:write`, remote revoke). Ending a
  session drops the refresh token and stamps `tokenInvalidBefore` so the
  device's outstanding access token dies on its next request rather than at
  TTL. Self-revoke of the current device expires BOTH cookies for an instant
  logout. Tenant-wide view: SessionController (`GET /api/v1/sessions`); revoke
  reuses `DELETE /api/v1/users/{id}/sessions/{sessionId}`.
- CustomAppController `/plan-limits` is declared before `/{id}` only for readability
  — Spring MVC gives literal segments precedence over path variables
  regardless of declaration order.
- AuditController: GET params (action/actorId, userId/success,
  traceId/method/status/userId/username) are translated into engine criteria
  and AND-combined by the query services; each surface also has the full POST
  /search variant. `iam:audit:read` is seeded into the Admin role.

### TenantFilter

- `shouldNotFilter` exempts ONLY `/api/v1/auth/company/**` (tenant creation —
  no tenant yet) and `/actuator/**`. Login and /me ARE tenant-specific and go
  through normal subdomain resolution.
- Only ACTIVE companies resolve (PROVISIONING/SUSPENDED/TERMINATED do not).
- `X-Tenant-ID` header fallback is dev-profile only — fully disabled in prod.

### TenantContextExecutor

- Set-and-restore window; the single sanctioned way to switch tenant context
  programmatically. Hand-rolled set/clear pairs leak the tenant across pooled
  threads when the restore/clear is missed ([RISK-10]). Restores the caller's
  context; clears when there was none.

### DTOs (wire contracts worth keeping)

- AssignPermissionsRequest: two modes — explicit (`all` null/false: replace
  set with `permissionIds`, empty clears all, unresolvable ids 404) vs
  `all=true` (set `all_permissions` flag, ignore `permissionIds`, clear the
  explicit set — the "ALL" shortcut). Switching back to explicit clears the
  flag; `permissionIds` must then be present. Max 100 ids.
- SearchRequest: page ≥0, size 1..1000 (aligned with
  `spring.data.web.pageable.max-page-size`), ≤5 sorts, ≤10 filters, q ≤200
  chars, ≤10 qFields. "A bounded request is a cheap request."
- PageResponse: `{data[], meta{page(0-based), pageSize, totalElements,
  totalPages, hasNext, hasPrevious}}` — API owns the wire contract, not
  Spring Data's drifting Page serialization.
- LoginResponse: access token also httpOnly cookie `sf_access_token`, refresh
  `sf_refresh_token`; body copies serve non-browser clients; `refreshToken`
  null on the /me shape; authorities are `{module}:{resource}:{action}`.
- ActiveSessionResponse vs AdminSessionResponse: admin view carries owner
  userId+email; `current` always false/absent on the admin view (admin is not
  the session owner).
- CustomAppPropertyRequest: `type` immutable after creation (existing values would
  be meaningless after a change); `required` keeps its wrapper +
  compact-constructor default because Jackson 3 fails null-into-primitive
  mapping for absent fields.
- CustomAppViewConfigDto: deliberately a STRUCTURED shape, not a free-text
  expression language — injection surface is structural (3.0.B spike
  outcome); every field resolves to a property id or enum; backend
  re-validates against the app's property set before persisting.
- CustomAppRecordSearchRequest: JSONB EAV path (PostgreSQL `@>` containment / `#>>`
  accessors, GIN-backed); limits ≤10 filters / ≤5 sorts / size ≤100 (value
  scans heavier than column reads → tighter page cap than the generic engine).
- UserDirectoryViewResponse: flat list projection; association lists become
  counts; detail endpoint still returns full role/group sets.
- NoteRequest/CustomAppRequest: create without `projectId` → default container;
  update `null` = leave unchanged, value = move.
- NoteCategoryRequest: `color` is a UI token never interpreted server-side; a
  category's project is fixed at create (moves rejected 409).
- SubdomainRules: `^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$` — single source
  shared by CompanyRegisterRequest @Pattern and SubdomainSuggestionService so
  the two cannot drift.
- CustomAppPlanLimitsResponse: values from the PlanDefinition registry via
  PlanLimitService.activePlan() (single plan-resolution chain); -1 =
  unlimited.

