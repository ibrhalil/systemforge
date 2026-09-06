# AGENTS.md

## Project

**ForgeSys** — modular multi-tenant SaaS platform. Java 21 + Spring Boot 4.1, PostgreSQL 16, Redis 7.4, Flyway. Hybrid model: built-in modules (pm: Projects & Tasks, apps: Custom App Builder, notes — Odoo/ERPNext style) + tenant custom apps (Notion/Airtable style, JSONB EAV). **Schema-per-tenant** isolation; **tenant *users* live in tenant schemas; *platform* identities live in `public`** (K-50); RBAC (User-Role + Group-Role + Role-Permission, inheritance, `all_permissions` flag).

Modules: `common` (TenantContext, shared exceptions; NO Spring/JPA) <- `persistence` (JPA entities, multi-tenancy, Flyway) <- `backend` (Spring Boot app, executable jar); `frontend` (React 19 + TS + Vite SPA) independent. Each has its own `AGENTS.md`.

## Language Policy (token optimization)

- **Reasoning / code / commits / filenames:** English. **User communication:** Turkish. **Only EN + TR.**
- **AI-facing docs (`AGENTS.md`, `docs/plans/`):** English. **User-facing docs (README, ARCHITECTURE, ROADMAP, DECISIONS, `docs/notes/`):** TR/EN mix allowed; prefer Turkish where English obscures meaning.

## Documentation map (pointers, not inline copies)

- `README.md` — setup, running, **build commands** (single source), API, troubleshooting.
- `docs/ARCHITECTURE.md` — request lifecycle, schema-per-tenant, entity hierarchy, **config profiles** (single source).
- `docs/DECISIONS.md` — decision log (K-XX / RISK-XX / DEBT-XX) + **frozen decisions** (do not re-litigate).
- `docs/CODE_NOTES.md` — index of "why" notes in `docs/notes/` (long narratives live there, not in code).
- `docs/reference/endpoints.md` — endpoint inventory (on demand; source of truth = controllers + springdoc).
- `docs/ROADMAP.md` — remaining work + completed-epics summary. · `docs/plans/` — active epic plan files.
- Module rules: `common/AGENTS.md` · `persistence/AGENTS.md` · `backend/AGENTS.md` · `frontend/AGENTS.md`.

## Setup

All commands live in `README.md`. Minimum: `mvn clean install` (tests on H2, no Docker) · `docker compose up -d` (db + redis) · backend: run `ForgeSysApplication` from the IDE (dev profile) · frontend: `cd frontend && npm install --include=optional && npm run dev`. `.env` is prod-only, never committed.

## Operational infrastructure (`infra/`)

Runtime/operational files, not source (details: `infra/README.md`): `config/` prod override · `data/` DB volumes (not committed) · `init-sql/` first-DB-creation scripts · `logs/` (not committed) · `ssl/` **NEVER commit** · `templates/` externalized runtime templates.

**init-sql vs Flyway (critical):** Flyway runs every startup from versioned history. `init-sql/` runs only when the postgres data directory is empty (first install). Never put the same file in both — Flyway checksum consistency breaks.

## Critical rules (all modules)

- **Tenant isolation is MANDATORY.** No query may skip the tenant filter; tenant data leakage is the most critical bug class. Tenant context is established by `TenantFilter` (`common.TenantContext` ThreadLocal); do NOT validate tenant in the controller.
- **The root pom is only a lightweight parent + aggregator** — no `<dependencies>` imposed on modules, only version management. No module uses `spring-boot-starter-parent` as parent.
- **Cyclic dependencies between modules are FORBIDDEN** (`common` <- `persistence` <- `backend`; `frontend` independent).
- **Versions live in the root `<properties>`**; module poms do not pin versions.
- **IDs are UUID everywhere** (`GenerationType.UUID`). Table names use the `t_` prefix.
- **Code style:** package `com.ibrhalil.forgesys.*`, DTOs are `record`, centralized error handling via `@RestControllerAdvice` (`ApiErrorResponse` + `ErrorCode`), Lombok in the backend module.
- **Comment policy:** 1-3 lines of contract/critical-invariant max. "Why" stories → `docs/notes/` (via CODE_NOTES index); decision history → DECISIONS.md.

## Documentation budget (keep it slim)

AGENTS.md files load into every agent session — bloat reduces rule adherence. Line budgets: root ≤ 100, module files ≤ 150. Include: commands not guessable from code, rules differing from defaults, gotchas, invariants. Exclude (derive from code): directory trees, dependency versions, endpoint/repo inventories, implementation history. Pointers (`see docs/...`) beat inline copies.

## Engineering principles

- **Investigate before implementing.** Search for existing implementations/conventions first; prefer improving existing code. State assumptions when ambiguous.
- **No speculative code.** Solve exactly the requested problem — no gold plating; plans live in DECISIONS.md, not in code (frozen decision #21).
- **Query performance.** Check for N+1; favor `@EntityGraph`/`JOIN FETCH`. Multi-tenant queries multiply cost — every query crosses a tenant schema.
- **Thread safety.** `TenantContext` ThreadLocal does NOT propagate across `@Async`/executor threads without a `TaskDecorator` ([RISK-10](docs/DECISIONS.md)). Always `clear()` in `finally`.
- **Backward compatibility.** Do not break `/api/v1/*` contracts without explicit intent; deprecate before removing.
- **Documentation = part of development.** Every significant change carries its doc delta: ADR → DECISIONS.md; endpoint → `docs/reference/endpoints.md`; architecture impact → ARCHITECTURE.md.

## Working mode (long-running & multi-agent work)

State lives in files, not conversation — the user must never re-explain context.

- **Plan file first.** Multi-phase work gets `docs/plans/<key>-<slug>.md` (phases, checkbox steps, verify commands, claims, status log) BEFORE implementation.
- **Resume protocol.** A resuming agent reads the plan file first, finds the first unchecked step, verifies code state against it, continues. Do not ask the user for context the plan file carries.
- **Step contract.** Every checked step leaves the repo green (`mvn clean install`; frontend also `npm run lint && npm test`). Half-done steps stay unchecked with a one-line note.
- **Parallel agents / claims.** Claim phases in the plan file's claims table before starting; do not edit files outside your claim. Chokepoint files (root pom, `SecurityConfig`, `PermissionCatalog`, `AGENTS.md`, `DECISIONS.md`, plan structure sections) are edited only with a claim and re-read immediately before editing.
- **Status log.** Append when a phase lands, a decision refines, or a blocker appears; epic outcomes are recorded as phases land. Completed epic → plan file deleted, records graduate to DECISIONS.md.

## Test

- Config profiles (dev/prod/test) single source: `docs/ARCHITECTURE.md#konfigürasyon-profilleri`.
- At least one test per new endpoint; extra care on changes touching tenant isolation.
- Frontend: a new feature does not merge without tests (Vitest + RTL, `npm test`).

## Limits

**Never:**
- **Run git operations without authorization.** `git commit`, `git push`, `git amend`, `git merge`, `git rebase`, `git reset --hard`, branch creation/deletion, `gh pr create`, etc. — ONLY when the user explicitly asks. Do NOT take initiative like "I'm done, let me commit." Stay in staging until the user says commit/push. Read-only (`git add`/`status`/`diff`/`log`) are fine.
- Do not commit/read `.env`, `application-prod.yaml` secrets, or RSA keys (`certs/*.pem`).
- Do not set `ddl-auto` to `validate` (multi-tenant + lazy tenant schema crashes at startup — always `none`; the schema lives in Flyway). Test profile exception: `create-drop`.
- Do not write cross-tenant queries. Do not log sensitive data (password, token, PII).

**Ask first:**
- Before adding a new Flyway migration (existing tenant schemas require `TenantMigrationRunner`, see [RISK-16](docs/DECISIONS.md)).
- Before adding a new dependency (first check whether the root pom accommodates it).

**Always:**
- Add a test for a new endpoint.
- Use `@Transactional` (method-level; `readOnly=true` for lookups) for service-layer write operations. **Exception:** `provisionTenant` is currently non-transactional ([DEBT-10](docs/DECISIONS.md)).

## Git

> Applies ONLY when the user explicitly asks for commit/push/PR — see "Limits / Never".

- **Branch:** `feat/SF-NN-kisa-aciklama` — the developer chooses their own `SF-NN`; not tied to the roadmap. Deleted after merge.
- **Commit:** Conventional Commits — `feat(tenant): add subdomain resolver`, `fix(auth): handle expired token`, `refactor: ...`, `test: ...`, `docs: ...`, `chore(deps): ...`. Subject <72 chars, lowercase, no period, imperative mood.
- All PRs target `develop`. Squash merge. Before a PR: `./mvnw test` + `npm run lint` + `npm test`.
