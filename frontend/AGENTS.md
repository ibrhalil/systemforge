# frontend/AGENTS.md

## Module

React 19 + TypeScript + Vite SPA. The Maven build (root pom) embeds it in the backend jar — `dist/` -> `backend/resources/static/`. Independent npm build; no Spring dependency on the backend. General rules from the root AGENTS.md apply.

For commands see [README](../README.md#build-komutları). Frontend summary:

```bash
cd frontend
npm install --include=optional
npm run dev       # http://localhost:3000 (/api -> :8080 proxy)
npm run lint      # oxlint
npm test          # vitest run (jsdom + React Testing Library)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve the build output locally
```

## Stack (real versions from `package.json`)

Every dependency is pinned to an **exact version** (`.npmrc`: `save-exact=true`).

- **dependencies:** `@dnd-kit/core` 6.3.1, `@tanstack/react-query` 5.102.1, `react`/`react-dom` 19.2.8, `react-icons` 5.7.0, `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 (K-44 notes preview — raw HTML deliberately NOT rendered, `rehype-raw` absent), `react-router-dom` 7.18.2, `react-select` 5.10.2, `react-toastify` 11.1.0, `zustand` 5.0.15
- **devDependencies:** `@tailwindcss/vite` 4.3.3 + `tailwindcss` 4.3.3, `@types/*`, `@vitejs/plugin-react` 6.1.0, `oxlint` 1.79.0, `typescript` 6.0.3, `vite` 8.2.2, `vitest` 4.1.11 + `jsdom` 30.0.1 + `@testing-library/react` 16.3.2 (+dom 19.x) + `@testing-library/jest-dom` 7.0.1 + `@testing-library/user-event` 14.6.6
- **Lint:** oxlint (`.oxlintrc.json` — plugins: `react`/`typescript`/`oxc`; `react/rules-of-hooks`=error, `react/only-export-components`=[warn, `{allowConstantExport: true}`])
- **Styling:** Tailwind CSS v4 via `@theme` tokens in `src/index.css` (no `tailwind.config`). Font: Outfit + Inter (Google Fonts, `index.html`).

## npm conventions

- **`package-lock.json` is NOT used and NOT committed.** `.npmrc` sets `package-lock=false`. Maven/Docker use `npm install --include=optional --no-package-lock`.
- `.npmrc`: `engine-strict=true`, `save-exact=true`, `package-lock=false`.
- `engines`: node `>=24.0.0 <25.0.0`, npm `>=11 <12`. `.nvmrc`: `24.19.0`.

## Dev server & proxy

`vite.config.ts`: dev server on `:3000`; `/api` and `/actuator` proxied to `http://localhost:8080` (`changeOrigin: true`). No CORS issues while the backend runs separately (IDE).

## Directory layout (folder-by-feature)

```
src/
  main.tsx                 # entry (StrictMode + ErrorBoundary + Toaster)
  app/CustomApp.tsx              # providers (QueryClient) + router; shell children are
                           # generated from app/Routes.ts (public routes + layout explicit)
app/Routes.ts            # SHELL_ROUTES config list: path/Component/authority per route —
                            # CustomApp maps it to <Route> + RequirePermission (authorities mirror
                            # app/Navigation.ts). Pages are React.lazy chunks; AppShell's
                            # <Suspense> around <Outlet/> covers chunk loading
  app/CustomApp.tsx              # providers (QueryClient) + router; tenant shell + platform shell wired
                            # in parallel: authStore.fetchMe() + platformAuthStore.fetchPlatformMe();
                            # /platform/login static route + /platform subtree (RequirePlatformAuth →
                            # PlatformShell → RequirePlatformPermission per route; index → companies)
  app/Navigation.ts        # data-driven sidebar config: NAV_ITEMS + NAV_GROUPS
                           # (labelKey/to/icon/authority per item; authority-less groups
                           # hide entirely)
lib/permissions.ts       # PERMISSIONS constants — the built-in tenant catalog mirrored from
                            # the backend PermissionCatalog (IAM_PERMISSIONS) + PLATFORM_PERMISSIONS
                            # mirror (7 names, K-50 PlatformPermissionCatalog); single frontend source
components/              # cross-feature/shared components
    AppShell.tsx           #   viewport-locked shell (lg:h-screen): fixed sidebar + fixed
                            #   breadcrumb topbar; page scrolls inside its own container.
                            #   Sidebar renders Navigation.ts (authority-filtered, empty
                            #   groups hidden), react-icons/lu icons, user chip, LanguageToggle
    RequireAuth.tsx        #   auth redirect guard
    RequirePermission.tsx  #   permission route guard — inline 403 state (no redirect)
    RequirePlatformAuth.tsx # K-50 platform auth guard (bare host, checks platformAuthStore)
    RequirePlatformPermission.tsx # K-50 platform permission guard
    Page.tsx               #   page scaffold: head (title/description/actions) over body —
                            #   every routed screen renders through this; breadcrumb portals
                            #   into the AppShell topbar (inline fallback without a shell)
    Breadcrumb.tsx         #   `Identity & Access > Groups > Developer` path line (last
                            #   segment = current page; `to` segments are links)
    BreadcrumbTargetContext.ts # portal target exposed by AppShell, consumed by Page
    LanguageToggle.tsx     #   TR/EN segmented switch
    ErrorBoundary.tsx, Toaster.tsx
    ImpersonationBanner.tsx # K-50 tenant-shell banner when `/me` reports impersonation info
                            #   (warning strip + `[imp]` document.title prefix; exit via logout)
    detail/                #   DetailPanel/DetailField/PermissionBadges + AssignSection (IAM detail pages)
    pickers/               #   reference-data selects: UserPicker/RolePicker/GroupPicker/ProjectPicker/
                            #   CustomAppPicker (async `q` typeahead over list endpoints, single or isMulti,
                            #   id→label bookkeeping with fallback ids) + useDebouncedLoadOptions
                            #   (debounce + stale-response guard). Reference-data selects use these —
                            #   never capped one-page list fetches.
    ui/                    #   design system: Badge, Button, CheckboxList, ConfirmDialog,
                            #   DataTable (sortable headers + per-column filter popovers + `toolbar` slot + SearchInput;
                            #   K-55 list states: first-load skeleton, keep-previous fetching bar, error+retry panel
                            #   — props `loading`/`fetching`/`error`/`errorIcon`/`onRetry`, precedence error > empty;
                            #   K-55 F3..F7 hardening: `onRowClick` row activation (click/Enter/Space), `bulkActions` selection
                            #   column + floating bulk bar (ephemeral key-signature selection preserved across auto-refetch,
                            #   cleared on dataset/mode change, ConfirmDialog-guarded destructive with stale-row filtering),
                            #   multi-sort chains (`sorts` + additive onSortChange via Shift+click, visual direction ▲/▼ +
                            #   aria-sort aligned across chain, inactive sortable LuChevronsUpDown), controlled/uncontrolled
                            #   viewModes (controlled skips local persistence), TableRow React.memo memoization,
                            #   auto-refresh interval in the settings menu (`onRefresh`),
                            #   active-query chips row (FilterChips — one removable chip per live clause,
                            #   static/async option label resolution, clear-all — plus the clickable
                            #   auto-refresh countdown chip (click = refresh now + countdown refill,
                            #   right-aligned, visible only while an interval is active)),
                            #   Drawer (K-55 F3 right slide-over dialog — row-detail surface; focus contract shared
                            #   with Modal via lib/useDialogPanel), CopyableValue (mono + one-click copy),
                            #   JsonBlock (pretty JSON), SavedViewsMenu (K-56 F3 named views, DB-backed v2 — saves
                            #   the query snapshot + column prefs block, applies both, silently migrates v1
                            #   localStorage rows; hidden without iam:saved-view:read),
                            #   EmptyState, Field, Modal, RowMenu (row/page-head overflow menu —
                            #   callers filter items by permission; empty items = no trigger),
                            #   SelectInput, TextArea, Spinner (single animate-spin source),
                            #   Toggle (boolean-setting switch)
  features/<name>/         # ONE folder per domain: pages + api.ts + hooks.ts + types.ts (+ components/)
    auth/                  #   Login/Register/VerifyTenant/VerifyEmail/ForgotPassword/ResetPassword
                           #   pages, authApi, registrationApi, types (K-21 tenant signup + K-48
                           #   user lifecycle: email verification + password reset flows live here)
    users/                 #   Users/UserDetail/Profile pages + 5 modal components (assign
                           #   modals fetch the user detail themselves — list rows are the
                           #   flat user-directory projection: counts, no role/group arrays)
     roles/  groups/  permissions/
     saved-views/           # per-user DB-backed list views (K-56 F3): api/hooks/types — the
                            # backend surface behind SavedViewsMenu (['saved-views', storageKey] keys)
    projects/              #   Typed project containers (K-45): ProjectsPage (create modal's type
                           #   options derive from the ACTIVE-module catalog — useProjectTypes), the
                           #   three-way ProjectDetailPage switch (TaskBoard / ProjectNotesPanel /
                           #   ProjectCustomAppsPanel — panels live in their feature folders, cross-feature
                           #   hook/panel imports), TaskBoard (components/)
    modules/               #   Module catalog + activation page (K-16, iam:module:read)
    apps/                  #   Custom App Builder UI (Epic 4.2 / K-42, K-45 project-scoped): app (project
                           #   column + CustomAppFormModal projectId anchor)/property/view/record CRUD,
                           #   RecordFormModal (create+edit), TABLE/BOARD/CALENDAR/LIST/GALLERY
                           #   renderers, row-based filter/sort DSL editor (client-applied),
                           #   User/Relation pickers + id→label resolvers, plan usage indicators
                           #   (GET /apps/plan-limits — numbers from the backend registry) +
                           #   components/ProjectCustomAppsPanel (the APPS container body)
audit/                 #   AuditLogs + LoginHistory (iam:audit:read)
      sessions/              #   self/admin/all sessions pages + SessionList component (K-28)
      notes/                 #   Notes module (K-44, K-45 project-scoped): NotesPage (DataTable +
                             #   category filter + pinned toggle + project column), NoteEditorPage
                             #   (target-project selector for new notes — ?projectId= or the catalog
                             #   default; categories follow the chosen container; markdown preview via
                             #   react-markdown, raw HTML never rendered) and components/ProjectNotesPanel
                             #   (the NOTES container body inside ProjectDetailPage).
      platform/              #   K-50 platform console (bare host, NO X-Tenant-ID): Login/Companies/
                             #   CompanyDetail/ServiceAccounts/PlatformAuditLogs pages + PlatformShell/
                             #   RequirePlatformAuth/RequirePlatformPermission + platformAuthStore +
                             #   platformApi.ts (createApiClient factory, no tenant header) + i18n platform.*/impersonation.*
      demo/                  #   DEV-only UI style-guide/pattern demos (lazy-imported behind
                             #   import.meta.env.DEV in app/CustomApp.tsx — tree-shaken from prod builds):
                            #   component showcase pages + pages/patterns/* list/detail/form/dashboard
                            #   pattern references. Not in Routes.ts; unreferenced in prod.
lib/                     # api (fetch + 401 refresh + K-55 searchQueryGet/sq wire + apiDownload/saveBlob),
                            # i18n (t/useT + messages), notify, format, select, cn,
                            # useListPageState (list-page scaffold: page/sort(s incl. multi-sort chains ≤5)/search
                            # + debounce + page-reset + syncUrl (flat paging/sort + sq filter blob) + applySearchQuery + currentQuery),
                            # searchQuery (K-55 URL-state codec: filter/search state JSON → base64url `sq` param),
                            # savedViews (K-56 F3 legacy localStorage v1 rows — the silent DB-migration source only), useDialogPanel (Modal/Drawer focus trap),
                            # useClientPagination, useDebouncedValue
                            # apiClient.ts  — shared `createApiClient` factory (tenant + platform clients)
                            # platformApi.ts  — platform instance (refresh `/api/v1/platform/auth/refresh`, NO X-Tenant-ID)
  store/                   # zustand: authStore (session + authorities), tenantStore (X-Tenant-ID),
                            # localeStore (sf_locale, TR/EN), platformAuthStore (parallel platform session)
  test/                    # Vitest suite (K-39): setup.ts + feature/primitive tests (api refresh, LoginPage,
                            # DataTable, Modal, useListPageState, apps/notes/projects feature pages — see src/test/)
  types/index.ts           # shared-only types: RBAC summaries, ApiErrorResponse, pagination
```

### Feature conventions

- `features/X/api.ts` — plain fetch wrappers per endpoint group (uses `api` from `lib/api`).
- `features/X/hooks.ts` — TanStack Query hooks; **query keys are the collection name** (`['users', params]`, `['roles', id]`, `['users', id, 'effective-permissions']`); mutations invalidate their collection prefix.
- **Server-side list search/sort/filter (K-49):** pages get the whole scaffold from `lib/useListPageState` (`{page, setPage, pageSize, setPageSize, sort, toggleSort, search, setSearch, searchFields, setSearchFields, filters, setFilters, q, listParams}` — debounced search + the page-reset contracts). `listParams` (`{page, size, sorts: [sort], q, qFields, filters}` — empty optional keys absent) is the ready-made query argument: `useX(listParams)`, or `useX({ ...listParams, extra })` for scoped legacy params (audit/notes). **URL state (K-55, split wire):** opt-in `syncUrl: true` reflects the committed state into the URL as TWO families — the filter/search part (`q`/`qFields`/`filters`) as a single base64url `sq` param via `lib/searchQuery`, paging/sorting as ordinary flat params (`?page=&size=&sort=field,dir`) — shareable view links; mount precedence URL > storageKey > defaults; typing replaces history, committed changes push; popstate re-hydrates; no filter/search active → no `sq` param (clean URL). The blob keys are exactly `{v,q,qFields,filters}` (locked by a schema test) and mirror the backend `SearchRequest` filter part — the `GET ?sq=` wire contract shares the codec. `SortState.direction` matches the POST /search body field (`SortCriteria.direction`) — never rename one side alone; `sorts` serializes to the same repeated `sort=field,dir` wire params as the raw `sort` string.
- **List states (K-55 step 1):** every server-paginated list page wires `loading={isLoading}` + `fetching={isFetching && !isLoading}` + `error={error && !data ? error : undefined}` + `onRetry={() => refetch()}` into DataTable, and its list hook sets `placeholderData: keepPreviousData` — first loads render skeletons, param changes keep the previous rows (thin top bar), failures show the retry panel (error > empty). Full-response pages follow the same wiring over their single query; sessions (Redis read model, non-DataTable `SessionList`) are out of this contract. `Column.sortKey` marks a DataTable column sortable (may differ from `key` — the users "name" column sorts by `email`); the value MUST be in the backend feature's sort whitelist or the request 400s. `Column.filter` (`ColumnFilterSpec`: engine field + control `text|number|date|boolean|select|multiselect` + static options or async `optionsLoader`) renders a per-column filter popover when the table receives `filters`/`onFiltersChange`; clauses are wire `FilterCriteria` (membership fields = multi-select pickers fed by option loaders). Feature apis expose ONE list entry point, `searchOrList(params)`: without clauses everything stays on GET (`?q=&qFields=&sort=` — legacy toolbar params keep their bookmarkable shape); with clauses the request routes through `POST /{resource}/search` with the scoped GET params folded in as EQ clauses (`lib/api.searchPost`). Shared list-param types live in `types/index.ts` (`SearchOrListParams`); per-feature params extend it with their scoped legacy keys (audit's `AuditLogParams` etc.). The SearchInput picker's keys MUST mirror the backend searchable registrations 1:1 (they serialize as repeated `qFields` params — smart-search targeting).
- **Rows-per-page:** choices live in `lib/pagination.ts` (`PAGE_SIZE_OPTIONS`, backend cap 1000); pages hold `pageSize` state and reset to page 0 on change. DataTable renders minimal segment buttons up to 6 options, then a ghost native `<select>` — extending the list never crowds the footer. Pages whose backend returns the full list in one response (e.g. permissions) paginate locally via `lib/useClientPagination` and wire the footer identically.
- `features/X/types.ts` — request/response types for that domain. Shared summaries (`RoleSummary` etc.) stay in `src/types/index.ts`.
- Cross-feature imports are allowed (e.g. groups pages use `useRoles`); keep them at hook/type level, not page level.
- `authStore`/`tenantStore` are cross-feature by design and live in `src/store/`.
- **List tables stay narrow:** association columns (a user's roles, a role's permissions, a group's members) render a count chip (or an `ALL` badge for the `all_permissions` flag), never the full list — the detail page shows it. New tables follow this pattern; use the DataTable `toolbar` slot for filters.

## Auth & tenant context (critical)

- Access/refresh tokens are **httpOnly cookies** (`sf_access_token`, `sf_refresh_token`); JS never reads them.
- `lib/api.ts` `apiFetch`: on 401 (non-auth endpoints) transparently calls `/api/v1/auth/refresh` once (concurrent 401s coalesce via `refreshPromise`) and retries. If refresh fails, `sessionExpiredHandler` (wired by `authStore`) clears the session → `RequireAuth` redirects to `/login`.
- `tenantStore` resolves tenant from localStorage (`sf_tenant_id`) or subdomain; every request carries `X-Tenant-ID` (dev-profile `TenantFilter`).
- **Platform auth (K-50):** parallel session via `platformAuthStore` + `platformApi.ts` (createApiClient factory). Platform requests (`/api/v1/platform/**`) NEVER carry `X-Tenant-ID`; platform cookies (`sf_platform_access_token`/`sf_platform_refresh_token`, path `/api/v1/platform`) are separate. Platform login at `/platform/login` (bare host); tenant console at subdomains.
- `authStore.hasAuthority('iam:user:write')` gates tenant UI; `platformAuthStore.hasAuthority('platform:company:read')` gates platform UI; the backend enforces the real security.

## Error/notification flow

- Global `QueryClient` `mutations.onError` → `notifyApiError` (toast) — skips field-level validation (`fields[]`, rendered inline by forms) and 401 (redirect).
- `extractFieldErrors(err)` → `Record<field, message>` for inline rendering.

## i18n

- Homegrown, zero-dependency: `src/lib/i18n/` — `messages.ts` (TR + EN dictionaries, flat keys namespaced `common.*`/`nav.*`/`table.*`/`<feature>.*`), `useT()` reactive hook for components, imperative `t()` for event handlers/toasts/stores. `{param}` interpolation supported.
- `store/localeStore.ts` — locale persisted in localStorage (`sf_locale`), default `tr`; TR/EN segmented switch in the AppShell footer (`components/LanguageToggle.tsx`).
- **Rules:** never hardcode user-visible strings — add the key to BOTH `tr` and `en` dictionaries (`tr` is the source of truth for the key set; `MessageKey` type keeps keys compile-checked). Backend `ErrorCode` → key maps (e.g. VerifyTenantPage `ERROR_KEYS`) resolve at render time.

## UI design contracts (K-54)

The design language is **deliberately characteristic** (hybrid: engineering precision +
raspberry brand), NOT the default "AI-generated" look. Contracts below are binding;
shared class strings live in **`components/ui/styles.ts`** (single source) — consume
them, never re-inline the recipes.

### Character layer (S)

- **Typography, 3 layers:** display headings in Outfit (`font-display` — `Page` h1,
  `Modal` h2); body in Inter (`font-sans`); machine meta in mono (`META_MONO` =
  `font-mono text-xs tabular-nums text-muted`) — UUID snippets, timestamps, counters,
  page numbers, status codes. Mono is semantic (machine data), never decoration.
- **Radius scale (Tailwind defaults, no overrides — usage discipline):** sm controls
  `rounded` · md controls + control tags `rounded-md` · cards/tables/popovers
  `rounded-lg` · modal `rounded-xl`. Never `rounded-2xl`.
- **Shadow philosophy — hairline first:** cards `border-glass` + `shadow-sm` (very
  subtle); popovers/menus `shadow-lg shadow-black/10` (crisp, single purpose); modal
  `shadow-2xl`. Never combine a hairline border with a wide diffuse shadow.
- **Badges squared:** `Badge` = `rounded` + tone tint + optional leading `dot`;
  control tags (SelectInput multi) = `rounded bg-accent/15` — interactive tags and
  static status badges are different species.
- **Active nav rail:** active sidebar item = `border-l-[3px] border-accent bg-accent/10`
  (semantic selection indicator). Decorative colored strips on content cards are BANNED.
- **Primary button is SOLID raspberry:** `bg-accent` with `hover:bg-accent-deep` tone
  ramp (no brightness filter).
- **No gradients ANYWHERE** (user directive, 2026-08-28): the ONLY gradient surfaces are
  the two shell sidebar logo tiles + sidebar edge rails (`AppShell`, `PlatformShell`).
  Everything else is flat color — auth hero tiles are solid `bg-accent` / tone tints
  (`bg-accent-green/10`, `bg-danger/10`), the page background is flat `--color-bg` (no
  radial washes).
- **Empty states:** bare muted icon (`text-muted/50`) — no tile, no tint.
- **Interaction ramp (never invent per-component states):**

  | State | Recipe |
  |---|---|
  | hover (neutral list) | `bg-main/5 text-main` |
  | hover (action menu item) | `bg-accent/5 text-accent` |
  | selected | `bg-accent/15 font-medium text-accent` |
  | focus (inputs) | `ring-2 ring-accent/50` — border stays `border-glass` |
  | focus-visible (actions) | `ring-2 ring-accent/60` — EVERY clickable |
  | disabled | `opacity-50` (single value app-wide) |

- **Micro-labels, one language:** `MICRO_LABEL` (`Field` labels, table `th`) — do not
  spray uppercase/tracking beyond labels and column heads; headings stay sentence case.

### Consistency layer (D)

- **Inputs:** `INPUT_BASE` (md: `rounded-md`... control md = `rounded-md`) / `INPUT_BASE_SM`
  from `components/ui/styles.ts`. Fill `bg-main/5` on white surfaces; toolbar search on
  tinted bars is the documented exception (`bg-surface`). Error: `border-danger/60`.
- **Popovers/menus:** `border-glass bg-surface shadow-lg shadow-black/10` + z-60
  portal when inside overflow containers; menu items per the ramp above.
- **Checkboxes:** `accent-accent` (single mechanism).
- **Color discipline:** ZERO hardcoded hex in components — hex lives only in
  `index.css` `@theme` (the demo `ThemeDemoPage` token editor is the exception).

### Banned (slop tells — do not introduce)

`rounded-2xl` surfaces · decorative colored border strips on cards · gradients of ANY
kind (sole exemption: the two shell sidebar logo tiles + edge rails) /
gradient buttons/text/glassmorphism · ghost card (hairline + diffuse shadow) · uppercase spray
· emoji icons · mono as decoration · identical icon-topped 3-card rows · stat banner
rows with invented numbers · hover/focus states invented per component.

## Gotchas

- **z-index scale:** `0` normal content · `20` sticky elements · `50` modal overlay (`Modal`) · `60` fixed portal menus (`RowMenu`, SelectInput menu). New surfaces pick from this scale — don't invent intermediate values.
- **Size & spacing scale (keep everything on it):** page body `p-6 lg:p-10` (matches topbar `px`); sections `gap-6`; cards/panels `p-5` (DetailPanel — never hand-rolled card sections); action footers `mt-4 flex justify-end gap-3` with default-size (md) buttons; controls (inputs, md buttons) sit on a ~36px height rhythm; empty/loading states `py-16`. Don't invent new paddings for new surfaces — reuse these.
- **Toggle vs Checkbox:** boolean SETTINGS (account enabled, group active, all-permissions) render as `Toggle` (`role="switch"`). Multi-select LISTS render as pickers/checkboxes by size: large or reference data (roles, groups, users, projects, apps — anything server-side `q`-searchable) uses the async `components/pickers/*` in `isMulti` mode; `CheckboxList` stays for small, bounded lists only (e.g. permission catalogs). A switch communicates a single state, not selection.
- **Page head actions:** at most TWO visible controls in the `Page` head — the primary action (list pages' create button) or the most frequent action (detail pages' Edit, `sm` ghost + pencil icon) plus a `RowMenu` overflow (`icon={LuEllipsisVertical}`) for everything else. Destructive actions live ONLY inside the overflow (danger tone), never as top-level buttons. Pass permission-filtered items — an empty array renders no trigger.
- **Save/Cancel placement:** commit actions always sit bottom-right of the editing surface — modal footers (`Modal` renders them `justify-end`) or a `mt-4 flex justify-end gap-3` footer row inside the card/panel, with default-size (md) buttons — **single-action footers too (e.g. "Change plan"), never `sm`, never `gap-2`/`mt-3` variants**. The most frequent action is `primary` and sits rightmost; Never place Save in a `DetailPanel` header (the `action` prop was removed), left-aligned, or in `sm` size.
- **Scroll architecture (sticky elements):** on desktop the shell is viewport-locked (`lg:h-screen` + `lg:overflow-hidden`) — the sidebar and the breadcrumb topbar are fixed; ONLY the page body scrolls, inside AppShell's `flex-1 overflow-y-auto` container. Sticky elements inside pages (e.g. future sticky DataTable headers) must use plain `top-0` relative to that scroll container — never offset for the topbar (it is outside the scroller) and never `position: fixed`. Below lg the shell keeps natural page scroll; the mobile nav is an off-canvas drawer (z-50) — sticky-in-page rules only apply inside the desktop scroll container.
- **Zustand selectors:** subscribe with primitive/action selectors (`useAuthStore((s) => s.isLoading)`), never destructure the whole store — action references are stable, whole-store subscriptions re-render on every write. `AppShell` intentionally subscribes to the `user` object so the authority-filtered nav re-renders on session changes.
- **Loading spinner bootstrap:** `authStore.isLoading` is bootstrap-only (`/me` check); never reuse it for login submission (router unmounts).
- **Query key discipline:** list queries key on the params object (`['users', params]`); detail on id. Effective-permissions keys are `['users', id, 'effective-permissions']`.
- **`SelectInput`** is the single select component (react-select, rendered with **`unstyled`** — visual emotion styles are dropped so the Tailwind `classNames` fully own the look; never re-add a `theme` color override or per-component `styles` beyond `minHeight`/`menuPortal`). Behavior is prop-driven: single (default), `isMulti`, `isClearable`, `creatable`, async `loadOptions`, and `size="sm"` for compact inline controls (e.g. TaskCard status mover). Indicators are Lucide (`LuChevronDown`/`LuX` via `components`). Menu renders in a portal (escapes Modal overflow). The old native `SelectField` was removed.
- **Icons:** `react-icons` (Lucide set, subpath import `react-icons/lu` — Vite tree-shakes). Never add inline SVGs; pick a Lucide icon.
- **Light corporate theme tokens:** `src/index.css` `@theme` — light sky page bg (`--color-bg: #f0f9ff`, flat — rose tint was tried and rejected 2026-08-28), white surfaces (`--color-surface/sidebar`), raspberry accent (`--color-accent: #c2185b`) + `--color-accent-deep` hover tone, `--font-display` (Outfit) + system mono stack (`--font-mono`); utilities like `bg-surface`/`text-muted`/`border-glass`/`font-display`. CustomApp is light-only (dark theme removed). Never use raw `text-white`/`bg-white/5` outside the gradient logo tiles — use tokens so a future theme stays possible.
- **Tests (K-39):** Vitest + React Testing Library, `npm test` (CI runs it too). Suite lives in `src/test/` (`setup.ts` + `*.test.ts(x)`); config in `vitest.config.ts` (jsdom, `globals: false` — tests import `describe/it/expect/vi` from `'vitest'` explicitly; `setup.ts` registers RTL cleanup + jest-dom matchers). Mocks: `vi.stubGlobal('fetch', ...)` for `lib/api` (no MSW), `useStore.setState({...})` for zustand stores, `useLocaleStore.setState({ locale: 'en' })` for stable query strings. **A new frontend feature does not merge without tests** — at minimum a hook/logic test plus a render test for new UI primitives.
- **Kanban DnD:** boards use DndContext per board (PointerSensor distance:5 + TouchSensor delay:200), droppable columns + DragOverlay; moves are optimistic (setQueryData + rollback onError); the card select-mover stays as the keyboard/touch alternative.

## Planned: DataTable enhancements

### 1. Bulk Operations — **IMPLEMENTED** (K-55 F4)

Shipped: optional `bulkActions?: BulkAction<T>[]` prop automatically prepends checkbox selection column. Key-signature row tracking preserves selection across same-dataset auto-refreshes; changes to dataset / view-mode reset selection. Shift+Click range selection supported. Floating bulk toolbar with selection count and action buttons, plus ConfirmDialog guards with stale-row filtering.

---

### 2. Table View Modes — **IMPLEMENTED**

Shipped: `viewModes?: TableViewMode[]` (table/card/list) + the toolbar view-switcher (`table.viewMode`), `cardRender?: (row: T) => ReactNode` / `listRender?: (row: T) => ReactNode` custom renderers (auto-generated structured cards when omitted), column visibility + density (`compact/normal/relaxed`) and the persisted `viewMode` — all stored via `tablePreferences` under the table's `storageKey` in localStorage. Per-column hiding keeps `hideable: false` primary columns visible. No further work planned here; new render modes follow the existing prop pattern.

