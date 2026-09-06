# backend/AGENTS.md

## Module

Spring Boot application — controller/service/security/config. Depends on `common` + `persistence`. Only this module produces an executable jar. General rules from the root AGENTS.md apply.

Commands: see [README](../README.md#build-komutları). Summary: `./mvnw -pl backend spring-boot:run` (always `-pl backend`, NOT from root), `./mvnw -pl backend test -Dtest=ClassName#method`.

## Package layout

Root package `com.ibrhalil.forgesys` (NOT `.backend`): `tenant/` (TenantFilter + `TenantContextExecutor` — owns both sanctioned tenant-context windows), `web/` (RequestMetadataFilter/RequestContext, `filter/` search engine, `projection/` list projections), `controller/`, `service/`, `dto/` (records), `exception/` (GlobalExceptionHandler, `ApiErrorResponse`, `ErrorCode`), `security/` (jwt/apikey/platformswitch/ratelimit adapters, `TokenHasher`), `config/` (SecurityConfig, MultiTenancyJpaConfig, runners, PermissionCatalog/PlatformPermissionCatalog, PlanDefinition/ModuleDefinition registries). Per-class "why" notes: `docs/notes/backend-*.md`.

## Tenant Context rules (CRITICAL)

- `TenantFilter` (order `-101`, before the security chain): Host header -> subdomain -> `CompanyRepository.findBySubdomain` -> `schemaName` -> `TenantContext`. Only `ACTIVE` companies resolve. `shouldNotFilter()` exempts ONLY `/api/v1/auth/company/**`, `/api/v1/platform/**`, `/actuator/**`. Login, `/me`, `/auth/platform-switch` ARE tenant-specific.
- **Do NOT validate tenant in the controller** — the filter is the single responsibility owner. Null context -> resolver returns `"public"` (public-schema data reachable).
- Services switching tenant programmatically MUST use `tenant/TenantContextExecutor`: `inTenantContext(schema, action)` (set-and-restore) and `withoutTenantContext(action)` (public-schema window). Hand-rolled `setCurrentTenant`/`clear` pairs are FORBIDDEN ([RISK-10](../docs/DECISIONS.md#risk-10) — a missing restore leaks the tenant across pooled threads).
- `X-Tenant-ID` header fallback is dev-profile only. `TenantContext` does NOT propagate across `@Async` without a `TaskDecorator` ([RISK-10]; `@EnableAsync` currently absent).

## Endpoint conventions

Endpoint inventory (paths/permissions/behavior): [docs/reference/endpoints.md](../docs/reference/endpoints.md) — read on demand; source of truth is controllers + springdoc (`/v3/api-docs`, dev/test only; prod disabled).

- All endpoints under `/api/v1/*`. Return response DTOs (`record`); entities are NEVER exposed; no `Map<String,Object>` returns (manual `toResponse` convention, [K-37](../docs/DECISIONS.md#k-37)).
- **Paged lists** return `dto/PageResponse<T>` (`{data, meta:{page, pageSize, totalElements, totalPages, hasNext, hasPrevious}}`, `meta.page` 0-based) — never raw Spring `Page<T>`. Every DB-backed collection that can grow returns it; documented `List<T>` exceptions: design-bounded nested resources (app properties/views, saved-views) + Redis read models (sessions).
- **Sorting is whitelisted:** every paged list runs its `Pageable` through `web/SortGuard.require(...)` against the feature's `FilterFieldSet` (metamodel constants, e.g. `User_.EMAIL`). Unknown/nested sort properties -> 400.
- **Search & filter engine** (`web/filter/`, K-49): `SearchRequest {page, size, sorts[], filters[], q, qFields[]}` + `FilterCriteria {field, operator, values[]}` (14 operators). Fields register per kind (DIRECT / JOINED to-one / SUBQUERY scalar / MEMBERSHIP) — wire names stay FLAT; resolution data is compile-time only. Every list surface ALSO exposes `POST /{resource}/search` under the same read permission as GET.
- **`GET ?sq=` (K-55 split wire):** GET lists accept the FILTER part as one URL-safe-base64 JSON blob (`{v, q, qFields, filters}`); paging/sorting always travel as flat params; precedence `sq` > flat; malformed -> 400. OUT of `sq`: custom-app records + platform service-accounts. The FE codec mirrors this contract (`lib/searchQuery`) — never rename one side alone.
- **Projected list reads (K-49):** DB-backed lists run as Criteria DTO projections (`web/projection/ProjectionListQuery` + per-feature executors in `service/`): one content query + one count query with the same predicate. Flatness rule: JOINED targets to-one ONLY, SUBQUERY must stay scalar (a to-many join silently breaks paging).
- **Errors:** uniform `ApiErrorResponse {timestamp, status, error, code, message, path, traceId, fields[]}`. `code` = stable `ErrorCode` enum name (e.g. `auth_bad_credentials`) — clients branch on it; message/status may evolve. Sensitive rejected values masked `[REDACTED]`. Client-error mappings: malformed params -> 400 `validation_error`; uniqueness races (`DataIntegrityViolationException`) -> 400 with the precise `*_TAKEN` code — never 500. Bean Validation (`@Valid`).
- New admin write endpoints declare `@AuditLog(...)` (`captureDelta=true` at privilege changes) — the AOP aspect writes the audit row; never call `auditService` manually.

## Service layer invariants

- Lookups `@Transactional(readOnly=true)`; writes method-level `@Transactional`. **Exception:** `provisionTenant` DDL is an implicit commit — recovery is idempotency, not rollback ([DEBT-10](../docs/DECISIONS.md#debt-10)). `TenantProvisioningService.verifyAndProvision` registers the K-47 sample-data seed as an afterCommit synchronization (the seed's REQUIRES_NEW tx must see committed activation rows); tokens are SHA-256 digests at rest, `adminPasswordHash` nulled after admin creation ([RISK-30](../docs/DECISIONS.md#risk-30)).
- **`RbacSeeder` NEVER touches user role assignments at startup** (privilege-escalation fix, 2026-08-16) — Admin is granted ONLY via `assignAdminTo` in provisioning. Platform permission names are NEVER tenant-seeded (K-50).
- Module activation (K-16): permission seed runs `REQUIRES_NEW` (resolves the tenant schema even under a `public`-pinned outer session); the activation record joins the CALLER's tx (REQUIRES_NEW here would FK-block + self-deadlock on PostgreSQL). Plan gate = `PlanLimitService.tryActivePlan` single resolution chain ([K-40](../docs/DECISIONS.md#k-40)).
- Privilege-change session revoke (`SessionRevocationService`, Faz 1): role/permission/group mutations bulk-stamp `tokenInvalidBefore` + drop refresh tokens for affected users; revoke targets resolved BEFORE soft-delete (the soft-delete filter would hide them). All-permissions rename/create also revokes flag holders.
- `CustomAppRecordSearchExecutor` JSONB search is **PostgreSQL-only** (gated IT; never executes on H2). User input never becomes SQL text — clauses pre-validated against the app's property set.
- Platform code must NOT use the tenant `@AuditLog` aspect — `PlatformAuditService` writes `public.t_platform_audit_logs` directly (REQUIRES_NEW, best-effort).
- Turkish-locale dev machines: surefire pins `argLine=-Duser.language=en` (likeIgnoreCase determinism, see `FilterSpecifications`).

## Configuration

Config profiles (dev/prod/test) single source: [ARCHITECTURE.md](../docs/ARCHITECTURE.md#konfigürasyon-profilleri). Key facts:

- `application.yaml` + dev/prod/test overlays; `SPRING_PROFILES_ACTIVE` (default `dev`).
- `MultiTenancyJpaConfig`: `@EntityScan("com.ibrhalil.forgesys.entity")` + `@EnableJpaRepositories("...persistence.repository")` + auditing (`AuditorAware` = SecurityContext userId, fallback `"system"`, [RISK-33]).
- `forgesys.security.password-pepper` (K-23): blank fails startup fast; prod needs `PASSWORD_PEPPER`. Legacy pepper-less hashes lazily rehash on login.
- Mail (K-53): profile-split senders — `SmtpMailSender` (`prod | smtp` companion profile) / `LogMailSender` (dev w/o smtp) / `InMemoryMailSender` (test). Templates: `infra/templates/mail/` build-injected (K-51). Ops: [docs/MAIL_RUNBOOK.md](../docs/MAIL_RUNBOOK.md).
- Rate limiting (Faz 3): token-bucket on public auth endpoints, Redis Lua dev/prod (fail-open), disabled in test. API-key bucket keyed by key PREFIX, never the secret.
- Actuator (K-43): prod exposes health/info/prometheus on a separate port 8081; dev/test same-port + metrics. springdoc (K-41): dev/test `/v3/api-docs` + swagger-ui; prod disabled (404).
- All `forgesys.*` keys are documented in the yaml files — read them there, do not re-document here.

## Gotchas

- **Filter registration:** `RequestMetadataFilter` `-102` -> `TenantFilter` `-101` -> security `-100`; `RequestLogFilter` (`-95`) + `RequestBodyCaptureFilter` (`-94`) run INSIDE the security chain via `FilterRegistrationBean` (their finally needs live tenant/auth/metadata ThreadLocals). Do NOT put these on bare `@Order` outside the chain — the write landed in `public` with nulls (regression-locked by `RequestLogFilterChainTest`).
- **SecurityConfig:** stateless chain, CSRF-disabled, `@EnableMethodSecurity` (K-26). Chain order: rate-limit -> api-key -> jwt. Platform endpoints require `platform:*` AND `scope=='platform'`; cross-scope tokens 403 both ways. `JwtAuthenticationFilter`'s `scope=platform` branch MUST split BEFORE the tenant lookup (`public.t_users` does not exist; platform cookie wins over tenant cookie).
- **REQUIRES_NEW audit writes + `@Transactional` tests:** audit/login-history writes commit outside test rollback — assert with membership + unique sentinels (`hasItem`), NOT counts.
- **Spring Boot 4.1 / Security 7:** test slices (`@WebMvcTest`, `@DataJpaTest`) REMOVED from standard autoconfigure — build MockMvc via `webAppContextSetup` or `@SpringBootTest` + real port. Jackson v3: `ObjectMapper` lives in `tools.jackson.*` (annotations stayed `com.fasterxml.jackson.annotation`). `SecurityProperties` lost `DEFAULT_FILTER_ORDER` (literal `-100`).
- CORS in `CorsConfig` (`allowCredentials=true`, cookie auth requires it; origins via `forgesys.security.cors.allowed-origins`).
- `AuditorAware` falls back to `"system"` for signup/provisioning/runners ([RISK-33]/[RISK-3] resolved).

## Planned

K-27 remainder (approval workflow, anomaly detection), K-29 notifications, K-30 activity feed — designs in [DECISIONS.md](../docs/DECISIONS.md), scheduling in [ROADMAP.md](../docs/ROADMAP.md).
