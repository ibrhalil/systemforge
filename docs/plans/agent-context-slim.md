# Plan: agent-context-slim — AGENTS.md + docs token optimization

## Goal

Shrink agent-facing documentation to research-backed line budgets without losing
binding rules. Source research: Claude Code memory guide (target <200 lines per
memory file; include only what the agent cannot derive from code; cut directory
layouts, dependency lists, API inventories, history) + Anthropic best-practices
("would removing this cause mistakes? if not, cut it") + opencode rules docs
(nested AGENTS.md is already path-scoped; use pointers + on-demand reads).

## Result (all phases landed 2026-09-06)

| File | Before | After |
|---|---|---|
| `AGENTS.md` (root) | 136 | **95** |
| `backend/AGENTS.md` | 259 | **66** (+139-line inventory moved to `docs/reference/endpoints.md`) |
| `frontend/AGENTS.md` | 293 | **91** |
| `persistence/AGENTS.md` | 99 | **66** |
| `common/AGENTS.md` | 24 | untouched |
| `docs/CODE_NOTES.md` | 1173 | **23** (index; topics split into `docs/notes/` — 5 files, dupes removed) |
| `docs/DECISIONS.md` | 467 | **459** (light trim; all `### K/RISK/DEBT-XX` anchors intact) |
| `docs/reference/endpoints.md` | — | 139 (new, on-demand) |

## Phases / steps

### Phase 1 — Root AGENTS.md
- [x] Compress Setup to pointer + 4-line block
- [x] Compress doc map; add `docs/notes/` + `docs/reference/` entries
- [x] Compress infra section (keep init-sql vs Flyway distinction, 1 line per dir)
- [x] Add "Documentation budget" rule (3 lines) to prevent re-bloating
- [x] Critical rules / Limits / Git sections stay intact
- Verify: `wc -l AGENTS.md` = 95 ✓

### Phase 2 — `docs/reference/endpoints.md`
- [x] Move backend endpoint inventory tables verbatim (public / self-service / tenant-admin / platform / audit) + behavior notes (user directory, visibility scope, all-permissions, switch/impersonation, auth stack)
- [x] Header: source of truth is controllers + springdoc; read on demand
- Verify: file exists (139 lines), tables intact ✓

### Phase 3 — backend/AGENTS.md
- [x] Replace endpoint tables with 1-line pointer + conventions summary
- [x] Replace per-service narratives with invariant bullets + `docs/notes/backend-*.md` pointers
- [x] Keep: Tenant Context rules, endpoint conventions (PageResponse/SortGuard/sq wire/error shape), filter chain order, config pointers, gotchas (compressed)
- Verify: `wc -l` = 66 ✓ (≤150)

### Phase 4 — frontend/AGENTS.md
- [x] Delete 120-line directory tree; keep conventions (~10 lines)
- [x] Delete dependency version list (package.json is source)
- [x] Delete "Planned: DataTable — IMPLEMENTED" sections → DECISIONS K-55/K-56 pointer
- [x] Keep: design contract tables (interaction ramp, banned list), auth/tenant, i18n, test policy, gotchas compressed
- Verify: `wc -l` = 91 ✓ (≤155)

### Phase 5 — persistence/AGENTS.md
- [x] Delete per-repository inventory; keep jpamodelgen/Specification conventions
- [x] Keep: entity hierarchy, soft-delete rules, migration tree + "next V" pointer, gotchas
- Verify: `wc -l` = 66 ✓ (≤85)

### Phase 6 — CODE_NOTES dedupe + split
- [x] Remove duplicated frontend sections (were under `## persistence` AND `## frontend` verbatim)
- [x] Split into `docs/notes/`: backend-services (231), backend-security-config (391), backend-web (289), persistence (35), frontend (113)
- [x] `docs/CODE_NOTES.md` becomes short index (23 lines)
- [x] References updated (root AGENTS doc map, backend AGENTS pointer)
- Verify: no dup section names; links resolve ✓

### Phase 7 — DECISIONS.md light trim
- [x] Trimmed verbose entries only: K-55 (Durum + Revizyon 2), K-45 (Faz 1), K-56 (Karar), RISK-30 (resolution); frozen section untouched
- [x] All `### K-XX`/`RISK-XX`/`DEBT-XX` headings unchanged (anchors verified)
- Verify: referenced anchors all resolve (case-insensitive heading check) ✓

### Phase 8 — Verification
- [x] All `DECISIONS.md#*` anchors referenced anywhere resolve ✓
- [x] No CODE_NOTES anchor links remain; repo-internal .md links resolve (node_modules excluded) ✓
- [x] Line targets met; docs-only change — no source/build impact

## Evaluated & rejected (do not re-litigate)

External prompt-template suggestions assessed 2026-09-06: persona prompts,
"don't re-analyze static context", SEARCH-REPLACE output format, localized
context requests — all already handled by system prompt / opencode tooling, or
would themselves add tokens. Scope discipline + explanation economy already
exist as root rules (frozen #21, comment policy). Not added.

## Claims

| Scope | Steps | Files | Date |
|---|---|---|---|
| Full epic (single agent) | Phases 1-8 | AGENTS.md files, docs/*, docs/plans/ | 2026-09-06 |

## Status log

- 2026-09-06 — Plan created; research done (Claude Code memory docs, Anthropic best-practices, opencode rules docs).
- 2026-09-06 — Phases 1-8 landed in one session. Savings: every session −30% root; backend/frontend sessions −66/−69%; CODE_NOTES read 92KB→topic file ≤391 lines. Documentation budget rule added to root AGENTS.md to prevent re-bloating. Ready for user review.
