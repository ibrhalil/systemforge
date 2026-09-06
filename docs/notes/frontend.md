# Frontend notes ("why" stories)

> Moved out of source comments. Index: [docs/CODE_NOTES.md](../CODE_NOTES.md) · rules: [frontend/AGENTS.md](../../frontend/AGENTS.md) · decisions: [docs/DECISIONS.md](../DECISIONS.md)

## frontend


### components/ui/DataTable.tsx (K-37/K-49-adjacent)

- `sortKey` MUST be in the backend feature's sort whitelist (SortGuard) or the
  request 400s — composite columns sort by a different field than `key`
  (users "name" column sorts by `email`).
- `filter` + `filters`/`onFiltersChange` are the K-49 column-filter opt-in:
  pages that don't pass filter state never render a trigger.
- Settings-menu dropdown (z-60, fixed portal scale from the AGENTS z-index
  ladder: 0 content / 20 sticky / 50 modal / 60 fixed portal menus) closes on
  outside pointerdown or Escape.
- "Keep at least one column visible" guard in `toggleColumnVisibility`.

### lib/api.ts

- Refresh-on-401: 15-min access token expires while the SPA is open; on 401
  (non-auth endpoints) transparently POST /api/v1/auth/refresh (httpOnly
  `sf_refresh_token` cookie — JS never reads it) and retry once. Concurrent
  401s coalesce into a single /refresh via the shared `refreshPromise`.
  Auth endpoints are excluded (`REFRESH_SKIP_EXACT` +
  `/auth/company/` prefix) so a genuine auth failure is not mistaken for an
  expirable token. Retry body-safety: api.post/put/patch always stringify
  bodies; GET/DELETE carry none.
- `sessionExpiredHandler` setter-injection breaks the circular dependency
  lib/api <- store/authStore <- api/auth <- lib/api; the store registers the
  handler at module load, and the handler clears the session → RequireAuth
  redirects to /login.

### features/custom-apps/types.ts

- Wire enums are the uppercase Java enum names; `AppValueFilter.value`
  semantics per operator follow backend `CustomAppQueryValidator` (kept in code —
  contract).
- `CustomAppRecord.values`: absent key = empty cell; JSON null = cleared value.
- Plan limits (`GET /apps/plan-limits`) come from the backend PlanDefinition
  registry — never hardcoded client-side; -1 = unlimited.
- `CustomAppRequest` is a full PUT: the backend sets `icon` unconditionally, so
  `null` clears it (omit on create when empty).
  TRIVIA: old ViewType comment ("view CRUD/renderers land in a later part")
  was stale — renderers shipped with Epic 4.2 (K-42).

### features/custom-apps/cellValue.ts

- `parseCellInput` triple-state contract: scalar to send / `null` clears /
  `undefined` = invalid, must not be submitted.
- `buildRecordPatch` partial-merge contract: only CHANGED keys present, `null`
  clears (required properties reject null server-side), untouched keys absent;
  empty object = nothing to send. For create, pass a record with an empty
  `values` map so every filled field becomes a change.
- "Emptying a filled cell clears it; an already-empty cell is a no-op."

### features/users/UserDetailPage.tsx

- One-page create/view/edit (`/users/new`, `/users/:userId`). Edit-mode save is
  diff-based and sequential (identity update → role set → group set), NOT
  atomic: unchanged assignments never trigger redundant session revocations; a
  mid-sequence failure keeps edit mode with drafts intact; re-save is
  idempotent (already-sent parts no longer dirty against the refetched user).
- Drafts are seeded ONCE in `startEdit`, never from a `user` effect — a
  background refetch (save invalidates `['users']`) cannot clobber edits.
- email/username are immutable in edit (backend updates only first/last name +
  enabled) — rendered as disabled inputs bound to the persisted user.
- Overflow menu invariants kept in code: hidden while editing (dirty form must
  not trigger parallel mutations); email re-send only pre-verification; unlock
  only during an active lock window (RISK-22 lazy expiry); self-delete omitted
  (backend 409 `self_delete_forbidden`).
- Head pattern (max one visible action + RowMenu overflow) and the save-footer
  placement rule live in frontend/AGENTS.md — no longer duplicated here.

### K-58 CRUD surface rollout (2026-09-06)

- The UserDetailPage mechanics above were promoted to the app-wide pattern
  (K-58): every entity detail page is ONE component serving `/new` and `/:id`
  with an in-page edit mode. Roles, groups, permissions, projects, tasks,
  custom apps, records and platform service accounts were migrated off
  create/edit modals; the closed exception list lives in frontend/AGENTS.md.
- Why drafts must be seeded in `startEdit` (not an effect) generalizes beyond
  users: every save invalidates its collection prefix, so a refetch effect
  would clobber ANY dirty inline-edit form mid-typing across all these pages.
- RecordPage has no single-record GET — the record payload comes from the
  app's bounded records fetch (`useViewRecords`, first 1000) and is picked by
  id. Views already cap client-side the same way; beyond 1000 records the
  page shows the not-found fallback (acceptable today, revisit with a
  `GET /records/{id}` if apps grow).
- Kanban quick-create stayed a modal deliberately (Jira/Linear convention);
  the card title/View action navigate to the task page.
- Demo pattern gallery retargeted: `DetailPagePatternDemo` teaches inline
  edit, `ListPagePatternDemo` teaches navigation + ConfirmDialog-only,
  `FormModalPatternDemo` is now the Quick Action Modal pattern.

### lib/useListPageState.ts (K-39/K-49)

- Contracts: new debounced search term / sort toggle / page-size change /
  filter change each reset the page to 0; page-size persists via storageKey.
- `listParams` shape `{page, size, sorts: [sort], q, qFields, filters}` with
  empty optional keys absent; scoped legacy params spread on top
  (`useNotes({ ...listParams, categoryId })`). `sorts` serialize to the same
  repeated `sort=field,dir` wire params as the raw string.
- DataTable wiring: `onPageSizeChange={setPageSize}`,
  `onSortChange={toggleSort}`, `onPageChange={setPage}`,
  `filters`/`onFiltersChange`, `toolbar={<SearchInput …/>}`.
- Client-paginated pages (single full response, e.g. permissions) use
  `useClientPagination`; they may take only the sort toggle from this hook —
  unused page/search state is inert when never wired.

### components/ui/ColumnFilterButton.tsx (K-49)

- Popover is a fixed-position body portal (z-60) like RowMenu/SelectInput
  menus — container overflow (short tables, `overflow-x-auto`) cannot clip it.
  Flips above the trigger near the viewport bottom (fallback height constant
  covers jsdom where measurement is unavailable).
- Outside scroll (including the table's overflow-x container) CLOSES the
  popover rather than repositioning the fixed portal — simpler and more
  predictable (same trade-off as RowMenu). Scrolls inside the panel or a
  SelectInput option menu keep the draft.
- Draft re-sync effect intentionally skips while open (deps suppressed) so an
  outside clause change (e.g. page reset) re-seeds only the closed state.

### components/pickers/ReferencePicker.tsx

- Monotonically-growing id→label map: search results merge in (never evicted),
  seeded from `selectedOptions` — single mode never flashes a raw id after a
  pick; multi mode keeps every chip labeled; unseen ids render raw.
- Label precedence: pick/search-fed map (fresh selection beats a stale
  caller-provided seed) → seed → raw id. TRIVIA: this comment block was
  duplicated verbatim in the file; deduplicated in this pass.
- `defaultOptions`: react-select only calls async loadOptions on non-empty
  input changes otherwise — menu-open must fetch the first page explicitly.
