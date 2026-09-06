# frontend/AGENTS.md

## Module

React 19 + TypeScript + Vite SPA. The Maven build (root pom) embeds it in the backend jar — `dist/` -> `backend/resources/static/`. Independent npm build; no Spring dependency. General rules from the root AGENTS.md apply.

```bash
cd frontend
npm install --include=optional   # NO package-lock (see npm conventions)
npm run dev       # :3000 (/api + /actuator -> localhost:8080 proxy)
npm run lint      # oxlint
npm test          # vitest run (jsdom + RTL)
npm run build     # tsc -b && vite build -> dist/
```

## Stack & npm conventions

- React 19, TanStack Query 5, zustand 5, react-router-dom 7, react-select 5, Tailwind CSS v4 (`@theme` in `src/index.css`, no tailwind.config), oxlint, Vitest + RTL. **Exact versions: `package.json` is the source** (`.npmrc: save-exact`).
- **`package-lock.json` is NOT used/committed** (`.npmrc: package-lock=false`); Maven/Docker use `npm install --include=optional --no-package-lock`. Engines: node 24.x, npm 11.x.
- Lint: oxlint (`.oxlintrc.json` — `react/rules-of-hooks`=error). react-icons Lucide (`react-icons/lu` subpath) ONLY — never inline SVGs.

## Structure conventions (folder-by-feature)

- `src/features/<name>/` — ONE folder per domain: pages + `api.ts` (plain fetch wrappers) + `hooks.ts` (TanStack Query) + `types.ts` (+ `components/`). Shared summaries stay in `src/types/index.ts`.
- **Query keys are the collection name** (`['users', params]`, `['users', id]`, `['users', id, 'effective-permissions']`); mutations invalidate their collection prefix.
- Cross-feature imports stay at hook/type level, never page level. `authStore`/`tenantStore`/`localeStore`/`platformAuthStore` live in `src/store/` (zustand).
- `lib/permissions.ts` mirrors the backend permission catalogs (IAM + platform) — keep 1:1 with `PermissionCatalog`/`PlatformPermissionCatalog`.
- **List tables stay narrow:** association columns (user's roles, role's permissions) render a count chip / `ALL` badge, never the full list — detail pages show it.
- Reference-data selects use the async `components/pickers/*` (debounced `q` typeahead) — never capped one-page list fetches; `CheckboxList` only for small bounded lists.
- `src/test/` — Vitest suite; mocks via `vi.stubGlobal('fetch')`, `useStore.setState`, `useLocaleStore.setState({locale:'en'})`.

## List-page engine (K-49/K-55)

- Pages get the scaffold from `lib/useListPageState` (`{page, pageSize, sort, search, searchFields, filters, ...}` -> `listParams {page, size, sorts, q, qFields, filters}`) — the ready query argument. Multi-sort chains ≤5.
- **URL state:** `syncUrl: true` reflects filter/search state as ONE base64url `sq` param (`lib/searchQuery` — blob keys exactly `{v,q,qFields,filters}`, schema-test-locked, mirrors backend `SearchRequest`) + paging/sorting as flat `?page=&size=&sort=field,dir`. Precedence URL > storageKey > defaults. `SortState.direction` matches the backend wire — never rename one side alone.
- Feature apis expose ONE list entry point `searchOrList(params)`: no clauses -> GET (legacy params); with clauses -> `POST /{resource}/search` (clauses folded as EQ via `lib/api.searchPost`). SearchInput `qFields` keys MUST mirror the backend searchable registrations 1:1.
- **List states:** wire `loading`/`fetching`/`error`/`onRetry` into DataTable + `placeholderData: keepPreviousData`; sessions (Redis, `SessionList`) are out of this contract.
- Rows-per-page choices: `lib/pagination.ts` (`PAGE_SIZE_OPTIONS`, backend cap 1000); full-response lists paginate locally via `lib/useClientPagination`.

## Auth & tenant context (critical)

- Access/refresh tokens are **httpOnly cookies** — JS never reads them. `lib/api.ts` transparently refreshes once on 401 (concurrent 401s coalesce) and retries; failed refresh -> `sessionExpiredHandler` -> `/login` redirect.
- Every tenant request carries `X-Tenant-ID` (`tenantStore`: localStorage `sf_tenant_id` or subdomain). **Platform requests (`/api/v1/platform/**`) NEVER carry it** — parallel session via `platformAuthStore` + `platformApi.ts`, separate cookies (path-scoped), platform login at `/platform/login` (bare host).
- `authStore.hasAuthority('iam:user:write')` gates tenant UI; `platformAuthStore.hasAuthority('platform:company:read')` gates platform UI; the backend enforces the real security.
- Global `QueryClient` `mutations.onError` -> `notifyApiError` toast (skips field-level `fields[]` + 401); `extractFieldErrors(err)` for inline form errors.

## i18n

Homegrown zero-dependency (`src/lib/i18n/`): `useT()` reactive, imperative `t()`, `{param}` interpolation. Never hardcode user-visible strings — add EVERY key to BOTH `tr` and `en` dictionaries (`tr` is source of key set; `MessageKey` type compile-checks). Locale persisted `sf_locale`, default `tr`. Backend `ErrorCode` -> key maps resolve at render time.

## UI design contracts (K-54)

Deliberately characteristic (engineering precision + raspberry brand), NOT the default "AI" look. Shared class recipes live in **`components/ui/styles.ts`** (single source) — consume, never re-inline. Light corporate theme tokens in `src/index.css` `@theme` (`--color-accent: #c2185b`, `--color-bg: #f0f9ff`, Outfit display + Inter body); ZERO hardcoded hex in components.

- **Typography:** display headings Outfit (`font-display`), body Inter, machine meta mono (`META_MONO` — UUIDs/timestamps/counters; semantic, never decoration). Micro-labels (`MICRO_LABEL`) only on `Field` labels + table `th` — headings sentence case.
- **Radius:** sm controls `rounded` · md controls `rounded-md` · cards/tables `rounded-lg` · modal `rounded-xl`. Never `rounded-2xl`.
- **Shadows — hairline first:** cards `border-glass` + `shadow-sm`; popovers `shadow-lg shadow-black/10`; modal `shadow-2xl`. Never hairline + diffuse combined.
- **Primary button SOLID raspberry** (`bg-accent`, hover `bg-accent-deep`).
- **No gradients ANYWHERE** (user directive 2026-08-28) — sole exemption: the two shell sidebar logo tiles + sidebar edge rails.
- **Empty states:** bare muted icon (`text-muted/50`) — no tile, no tint.

Interaction ramp (never invent per-component states):

| State | Recipe |
|---|---|
| hover (neutral list) | `bg-main/5 text-main` |
| hover (action menu item) | `bg-accent/5 text-accent` |
| selected | `bg-accent/15 font-medium text-accent` |
| focus (inputs) | `ring-2 ring-accent/50` (border stays `border-glass`) |
| focus-visible (actions) | `ring-2 ring-accent/60` — EVERY clickable |
| disabled | `opacity-50` (single value app-wide) |

**Banned (slop tells):** `rounded-2xl` · decorative colored border strips · gradients of ANY kind (above exemption only) / gradient buttons/text/glassmorphism · ghost cards · uppercase spray · emoji icons · mono as decoration · identical icon-topped 3-card rows · invented stat banners · per-component hover/focus states.

**Inputs/popovers:** `INPUT_BASE`(_SM) recipes; fill `bg-main/5` (toolbar search `bg-surface` = documented exception); error `border-danger/60`. Popovers `border-glass bg-surface shadow-lg shadow-black/10` + z-60 portal in overflow containers. Checkboxes `accent-accent`.

## Gotchas

- **z-index scale:** `0` content · `20` sticky · `50` modal · `60` fixed portal menus — nothing in between.
- **Spacing scale:** page body `p-6 lg:p-10`; sections `gap-6`; cards `p-5` (DetailPanel); action footers `mt-4 flex justify-end gap-3` md buttons; controls ~36px rhythm; empty/loading `py-16`. Reuse, don't invent.
- **Toggle vs Checkbox:** boolean SETTINGS = `Toggle` (`role="switch"`); multi-select LISTS = pickers (large/reference) or `CheckboxList` (small bounded).
- **Page head:** max TWO controls — primary/most-frequent action + `RowMenu` overflow (`LuEllipsisVertical`); destructive actions ONLY inside the overflow (danger tone); pass permission-filtered items (empty = no trigger).
- **Save/Cancel:** bottom-right of the editing surface (modal footer or `mt-4 flex justify-end gap-3`, md buttons) — single-action footers too; never `sm`, never in a `DetailPanel` header, never left-aligned.
- **Scroll architecture:** desktop shell is viewport-locked (`lg:h-screen`) — ONLY the page body scrolls; sticky elements use plain `top-0` (the topbar is outside the scroller); never `position: fixed`. Below lg: natural scroll + off-canvas nav (z-50).
- **Zustand:** primitive/action selectors (`useAuthStore((s) => s.isLoading)`), never whole-store destructuring. `AppShell`'s intentional `user` subscription is the exception.
- `authStore.isLoading` is bootstrap-only (`/me`) — never reuse for login submission.
- **`SelectInput`** is the single select component (react-select rendered `unstyled` — Tailwind `classNames` own the look; never re-add `theme`/`styles`). Menu renders in a portal (escapes Modal overflow); `size="sm"` for compact inline controls.
- **Kanban DnD:** DndContext per board (PointerSensor distance:5 + TouchSensor delay:200) + DragOverlay; moves optimistic (setQueryData + rollback onError); select-mover stays as keyboard/touch alternative.
- **Tests (K-39):** a new feature does not merge without tests — at minimum a hook/logic test + a render test for new UI primitives (`src/test/`, config `vitest.config.ts`).

DataTable capabilities (view modes, bulk ops, virtualization, FilterChips, SavedViewsMenu — K-55/K-56) are shipped and documented in [DECISIONS.md](../docs/DECISIONS.md#k-55); new render modes follow the existing prop pattern.
