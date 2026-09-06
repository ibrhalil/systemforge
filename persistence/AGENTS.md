# persistence/AGENTS.md

## Module

JPA entities, repositories, multi-tenancy infrastructure, Flyway migration. Depends on `common`. NO Spring Web/Security dependency. General rules from the root AGENTS.md apply.

Commands: see [README](../README.md#build-komutları). Summary: `./mvnw -pl persistence test`, `./mvnw -pl persistence -am clean install`.

## Entity Hierarchy

Full detail (inheritance tree + schema-table mapping): [ARCHITECTURE.md - Entity Hierarchy](../docs/ARCHITECTURE.md#entity-hiyerarşisi).

```
AuditEntity (@MappedSuperclass — createdDate/updatedDate+by, OffsetDateTime, timestamptz)
  ├ SoftDeleteAuditEntity (isDeleted, deletedAt, @Version, softDeleteFilter @Filter — auto-enabled)
  │    └ BaseEntity (UUID id + equals/hashCode)   <- Company, User, Role, Permission, Group,
  │       ├ UserAccount, UserProfile (@MapsId, extends SoftDeleteAuditEntity)    Plan/Subscription/TenantModule (public)
  └ GeneratedIdAuditEntity (UUID id, no soft delete)  <- TenantVerificationToken, UserAuthToken,
       PlatformUser, PlatformApiKey, PlatformAuditLog (K-50, @Table(schema="public")), SavedView (K-56)
```

Rules:
- Java field is `createdDate` (column `created_at`). IDs are UUID (`GenerationType.UUID`); tables use the `t_` prefix; constraints `idx_*`/`uk_*`/`fk_*`.
- `@SQLDelete` is separate on each concrete entity (table-specific SQL, `version = version + 1`).
- **Soft-delete filter:** `@FilterDef(name="softDeleteFilter", autoEnabled=true, applyToLoadByKey=true)` on `SoftDeleteAuditEntity` — loads/queries/JOINs hide `is_deleted=true` by default. Opt-in including-deleted ONLY via `SoftDeleteFilterScope` fragments (Company + User only; detach is mandatory — an opt-in load left in the persistence context leaks past the window via the L1 cache).
- Spring Data auditing (`@CreatedDate` etc.) -> `OffsetDateTime` + `timestamptz`.
- View/read-model entities (exception-only since K-49 — lists use backend Criteria projections) carry the `View` suffix.

## Multi-Tenancy (Schema-per-Tenant)

Strategy + request lifecycle: [ARCHITECTURE.md](../docs/ARCHITECTURE.md#schema-per-tenant-modeli). Persistence-specific:

- `SchemaPerTenantConnectionProvider` validates schema names with `^[a-z0-9_]+$` (SQL injection defense); `SET search_path` on getConnection, reset on releaseConnection.
- `TenantIdentifierResolver` reads `TenantContext`, returns `"public"` when null/blank.
- **Master schema (`public`):** `Company`, `TenantVerificationToken`, `Plan`, `Subscription` (one active per company, partial unique), `TenantModule` (per `(company_id, module_key)`, key NOT an FK), `PlatformUser`/`PlatformApiKey`/`PlatformAuditLog` (K-50; API keys stored as SHA-256 digest only; platform audit append-only).
- **Tenant schema (`tenant_<subdomain>`, lowercase, dashes -> `_`):** User/Role/Permission/Group + join tables. `CompanyStatus`: `PROVISIONING` -> `ACTIVE` (K-21 verify) -> `SUSPENDED`/`TERMINATED`.

## Flyway Migration

```
src/main/resources/db/migration/
├ public/   # auto-config at startup — public schema (t_companies + t_platform_*)
├ tenant/   # programmatic at provisioning — each tenant schema (TenantMigrationSupport)
└ module/   # per-module tenant migrations, ownMigrations=true (apps/, notes/)
```

- **Current trees:** public `V1__baseline` (`t_companies` + tokens, RISK-30 digest baked in), `V2__plans_subscriptions_modules`, `V3__platform_identity`; tenant `V1__baseline` (IAM + RBAC + audit triggers + projects/tasks), `V2__request_logs`, `V3__project_container`, `V4__user_auth_tokens`, `V5__purge_retired_platform_permissions`, `V6__saved_views`. **The next public migration is `V4`, tenant `V7`.** (File contents = the SQL itself; read them there.)
- A new tenant migration that affects existing tenants REQUIRES `TenantMigrationRunner` ([RISK-16](../docs/DECISIONS.md#risk-16) — backend, `@Profile("!test")`, iterates `t_companies` at startup, per-tenant try/catch).
- `baselineOnMigrate` intentionally NOT used — fresh DBs only since the K-36 squash (a baseline would silently skip V1 on a non-empty schema).
- **Module migrations live under `db/migration/module/<key>/` — deliberately OUTSIDE `tenant/`** (Flyway scanning is recursive; a module subtree inside `tenant/` would collide on versions). They run against per-module histories `flyway_schema_history_mod_<key>`, versioning independently from V1. Ordering: `TenantMigrationRunner` applies the core tree BEFORE `ModuleSyncRunner` re-syncs module trees (module V2 files may reference V3 core columns).
- K-45: project name uniqueness is PER-TYPE (`uk_projects_type_name` partial) — each type is its own naming namespace; default "Genel" containers are inserted by the module V2 migrations, not by core DDL.
- H2 compatibility: long form `TIMESTAMP WITH TIME ZONE` (never `TIMESTAMPTZ` shorthand). Tenant/public SQL never runs on H2 (test: `flyway.enabled=false` + `create-drop`); partial-index `WHERE` syntax is PG-only.

## Repository

Package `com.ibrhalil.forgesys.persistence.repository`. Extends `JpaRepository`; list-bearing repos also `JpaSpecificationExecutor` (backend filter engine queries through Specifications, with `@EntityGraph` overrides keeping the N+1 profile flat). The module compiles with `hibernate-jpamodelgen` — generated `Entity_` classes carry compile-time field constants (`User_.EMAIL`) used by backend sort/filter whitelists (renames break the build). Repository methods are discoverable in the interfaces — do not re-invent queries that already exist there.

## Gotchas

- **`ddl-auto=none` is MANDATORY** (NEVER `validate` — startup would verify every entity against `public` -> crash). Test profile exception: `create-drop`.
- **`@EntityScan("com.ibrhalil.forgesys.entity")`** — entities live in `entity`, NOT `persistence.entity`; repositories in `...persistence.repository`. Wired by `MultiTenancyJpaConfig` (backend).
- **`hashCode()` ([DEBT-7] resolved):** ID-based (`id == null ? identityHashCode : id.hashCode()`) — never put a transient entity into a `HashSet` key and look it up after persist (the hash flips).
- **Soft-delete + UNIQUE ([RISK-17]):** deleted rows remain — partial unique indexes required (`CREATE UNIQUE INDEX ... WHERE is_deleted = false`) for all soft-delete entities; non-soft-delete entities + join tables keep normal UNIQUE.
- **Append-only audit tables:** `t_audit_logs`/`t_login_history` + K-50 `t_platform_audit_logs` carry `BEFORE UPDATE OR DELETE` triggers (distinct function names avoid search_path coupling). App is insert-only by design; `ALTER TABLE` still works for migrations.
- **User soft-delete cascade:** `User` cascades PERSIST/MERGE/REMOVE to both `@MapsId` children — `em.remove(user)` runs each child's `@SQLDelete` in the same flush (regression-locked by `UserSoftDeleteSyncTest`).
- `t_role_parents` self-M2M (Faz 4a inheritance): soft-deleted parents are filtered out; orphan join rows are harmless. `t_roles.all_permissions` flag resolves dynamically (see backend); Admin carries NO explicit grant rows.
