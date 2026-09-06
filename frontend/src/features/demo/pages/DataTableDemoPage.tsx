import { useState } from 'react';
import {
  LuEye,
  LuPencil,
  LuTrash2,
  LuCheck,
  LuX,
  LuPackage,
} from 'react-icons/lu';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { RowMenu } from '../../../components/ui/RowMenu';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Toggle } from '../../../components/ui/Toggle';
import { DemoSection } from '../components/DemoSection';
import {
  MOCK_USERS,
  MOCK_PRODUCTS,
  paginate,
  sortBy,
  type MockUser,
  type MockProduct,
} from '../mockData';
import type { SortState } from '../../../types';

const PAGE_OPTS = [5, 10, 20] as const;

/* ─────────────────────────────────────────────────────────────────
   1. Basic DataTable
───────────────────────────────────────────────────────────────── */
function BasicExample() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const result = paginate(MOCK_USERS, page, pageSize);

  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email' },
    { key: 'firstName', header: 'First Name' },
    { key: 'lastName', header: 'Last Name' },
    { key: 'username', header: 'Username' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      pageSizeOptions={PAGE_OPTS}
      onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
    />
  );
}

const BASIC_CODE = `const columns: Column<User>[] = [
  { key: 'email',     header: 'Email' },
  { key: 'firstName', header: 'First Name' },
  { key: 'lastName',  header: 'Last Name' },
  { key: 'username',  header: 'Username' },
];

<DataTable<User>
  columns={columns}
  data={data.items}
  rowKey={(u) => u.id}
  page={page}
  pageSize={pageSize}
  totalElements={data.totalElements}
  totalPages={data.totalPages}
  onPageChange={setPage}
  pageSizeOptions={[5, 10, 20]}
  onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
/>`;

/* ─────────────────────────────────────────────────────────────────
   2. Sortable Columns
───────────────────────────────────────────────────────────────── */
function SortableExample() {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(5);
  const [sort, setSort] = useState<SortState>({ field: 'email', direction: 'asc' });

  const toggleSort = (field: string) => {
    setSort((s) =>
      s.field === field
        ? { field, direction: s.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
    setPage(0);
  };

  const sorted = sortBy(MOCK_USERS, sort.field as keyof MockUser, sort.direction);
  const result = paginate(sorted, page, pageSize);

  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email', sortKey: 'email', hideable: false },
    { key: 'firstName', header: 'First Name', sortKey: 'firstName' },
    { key: 'lastName', header: 'Last Name', sortKey: 'lastName' },
    { key: 'createdAt', header: 'Created', sortKey: 'createdAt' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      sort={sort}
      onSortChange={toggleSort}
    />
  );
}

const SORTABLE_CODE = `const [sort, setSort] = useState<SortState>({ field: 'email', direction: 'asc' });

const toggleSort = (field: string) => {
  setSort((s) =>
    s.field === field
      ? { field, direction: s.direction === 'asc' ? 'desc' : 'asc' }
      : { field, direction: 'asc' },
  );
};

// Column must have sortKey set:
{ key: 'email', header: 'Email', sortKey: 'email', hideable: false }

<DataTable
  columns={columns}
  sort={sort}
  onSortChange={toggleSort}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   3. Toolbar — Smart Search (SearchInput with field targeting)
───────────────────────────────────────────────────────────────── */

/**
 * SearchField definitions mirror the backend's searchable columns.
 * searchable: false → rendered as disabled in the popover with a
 * "Not supported" badge (e.g. derived/computed columns).
 */
const SEARCH_FIELDS = [
  { key: 'email',     label: 'Email',    searchable: true  },
  { key: 'name',      label: 'Name',     searchable: true  },
  { key: 'username',  label: 'Username', searchable: true  },
  { key: 'status',    label: 'Status',   searchable: false }, // server-side enum, not text-searchable
  { key: 'roleCount', label: 'Roles',    searchable: false }, // numeric count, not text-searchable
] as const;

type SearchFieldKey = typeof SEARCH_FIELDS[number]['key'];

function ToolbarExample() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  // Empty array = "All Fields" (mirrors useListPageState behaviour)
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  // Client-side filtering — mirrors what the server does with `q` + field targeting.
  const activeKeys: SearchFieldKey[] =
    selectedFields.length === 0
      ? ['email', 'name', 'username']          // "All" → only text-searchable fields
      : (selectedFields as SearchFieldKey[]);

  const filtered = MOCK_USERS.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return activeKeys.some((k) => {
      if (k === 'email')    return u.email.toLowerCase().includes(q);
      if (k === 'name')     return `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
      if (k === 'username') return u.username.toLowerCase().includes(q);
      return false;
    });
  });

  const result = paginate(filtered, page, 5);

  const columns: Column<MockUser>[] = [
    { key: 'email',     header: 'Email',      hideable: false },
    { key: 'firstName', header: 'First Name'  },
    { key: 'lastName',  header: 'Last Name'   },
    { key: 'username',  header: 'Username'    },
    { key: 'status',    header: 'Status'      },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={(p) => { setPage(p); }}
      emptyMessage="No users match your search."
      toolbar={
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(0); }}
          placeholder="Search users…"
          fields={[...SEARCH_FIELDS]}          // enables the 🔽 field-picker button
          selectedFields={selectedFields}
          onSelectedFieldsChange={(f) => { setSelectedFields(f); setPage(0); }}
          storageKey="demo-smart-search"       // persists field selection in localStorage
        />
      }
    />
  );
}

const TOOLBAR_CODE = `import type { SearchFieldOption } from 'components/ui/SearchInput';

// Define which columns are text-searchable.
// searchable: false → shown disabled with "Not supported" badge in the popover.
const SEARCH_FIELDS: SearchFieldOption[] = [
  { key: 'email',    label: 'Email',    searchable: true  },
  { key: 'name',     label: 'Name',     searchable: true  },
  { key: 'username', label: 'Username', searchable: true  },
  { key: 'status',   label: 'Status',   searchable: false }, // enum, not text-searchable
];

// In your page component:
const {
  search, setSearch,
  searchFields, setSearchFields,  // from useListPageState
  q,                               // debounced, field-aware query string → sent to the server
} = useListPageState({ storageKey: 'users' });

// Wire everything to SearchInput — field selection is persisted via storageKey:
<DataTable
  toolbar={
    <SearchInput
      value={search}
      onChange={(v) => { setSearch(v); setPage(0); }}
      placeholder="Search users…"
      fields={SEARCH_FIELDS}
      selectedFields={searchFields}
      onSelectedFieldsChange={(f) => { setSearchFields(f); setPage(0); }}
      storageKey="users"           // shared with useListPageState → same localStorage key
    />
  }
  ...
/>

// The generated \`q\` is sent to your query hook:
useUsers({ page, size: pageSize, sorts: [sort], q: q || undefined })`;

/* ─────────────────────────────────────────────────────────────────
   4. Column Settings & Density (storageKey)
───────────────────────────────────────────────────────────────── */
function ColumnSettingsExample() {
  const [page, setPage] = useState(0);
  const result = paginate(MOCK_USERS, page, 5);

  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email', hideable: false },
    { key: 'firstName', header: 'First Name' },
    { key: 'lastName', header: 'Last Name' },
    { key: 'username', header: 'Username' },
    { key: 'createdAt', header: 'Created' },
    { key: 'roleCount', header: 'Roles' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      storageKey="demo-column-settings"
      customizableColumns
    />
  );
}

const COLUMN_SETTINGS_CODE = `// storageKey enables the settings ⚙ icon in the toolbar area.
// Preferences (hidden columns + density) persist in localStorage.
// hideable: false prevents a column from being hidden.

<DataTable
  storageKey="my-table"
  customizableColumns    // true by default when storageKey is set
  columns={[
    { key: 'email', header: 'Email', hideable: false }, // always visible
    { key: 'firstName', header: 'First Name' },         // hideable
  ]}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   5. Row Actions (RowMenu)
───────────────────────────────────────────────────────────────── */
function RowActionsExample() {
  const [page, setPage] = useState(0);
  const result = paginate(MOCK_USERS, page, 5);

  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email', hideable: false },
    { key: 'firstName', header: 'First Name' },
    { key: 'role', header: 'Role' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      actionsHeader="Actions"
      actions={(u) => (
        <RowMenu
          ariaLabel="Actions"
          items={[
            { label: 'View', onClick: () => alert(`View: ${u.email}`), icon: LuEye },
            { label: 'Edit', onClick: () => alert(`Edit: ${u.email}`), icon: LuPencil },
            { label: 'Delete', onClick: () => alert(`Delete: ${u.email}`), icon: LuTrash2, danger: true },
          ]}
        />
      )}
    />
  );
}

const ROW_ACTIONS_CODE = `import { RowMenu } from 'components/ui/RowMenu';
import { LuEye, LuPencil, LuTrash2 } from 'react-icons/lu';

<DataTable
  actionsHeader="Actions"
  actions={(row) => (
    <RowMenu
      ariaLabel="Actions"
      items={[
        { label: 'View',   onClick: () => navigate(\`/\${row.id}\`), icon: LuEye },
        { label: 'Edit',   onClick: () => setEditing(row),         icon: LuPencil },
        { label: 'Delete', onClick: () => setDeleting(row),        icon: LuTrash2, danger: true },
      ]}
    />
  )}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   6. Custom Cell Renderers
───────────────────────────────────────────────────────────────── */
function CustomRenderersExample() {
  const [page, setPage] = useState(0);
  const result = paginate(MOCK_USERS, page, 5);

  const columns: Column<MockUser>[] = [
    {
      key: 'email',
      header: 'User',
      hideable: false,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          {/* Avatar initials */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {(u.firstName[0] ?? '') + (u.lastName[0] ?? '')}
          </span>
          <div className="flex flex-col">
            <span className="font-medium text-main">{u.email}</span>
            <span className="text-xs text-muted">{u.firstName} {u.lastName}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge
          tone={u.role === 'admin' ? 'accent' : u.role === 'editor' ? 'blue' : 'muted'}
        >
          {u.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <Badge
          tone={u.status === 'active' ? 'green' : u.status === 'locked' ? 'warning' : 'muted'}
        >
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'emailVerified',
      header: 'Verified',
      render: (u) =>
        u.emailVerified ? (
          <LuCheck className="h-4 w-4 text-accent-green" aria-label="Verified" />
        ) : (
          <LuX className="h-4 w-4 text-muted" aria-label="Not verified" />
        ),
    },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={result.items}
      rowKey={(u) => u.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
    />
  );
}

const CUSTOM_RENDERERS_CODE = `// Column render prop receives the full row object.
{
  key: 'role',
  header: 'Role',
  render: (u) => (
    <Badge tone={u.role === 'admin' ? 'accent' : 'muted'}>
      {u.role}
    </Badge>
  ),
},
{
  key: 'emailVerified',
  header: 'Verified',
  render: (u) =>
    u.emailVerified
      ? <LuCheck className="h-4 w-4 text-accent-green" />
      : <LuX className="h-4 w-4 text-muted" />,
},`;

/* ─────────────────────────────────────────────────────────────────
   7. Export & Refresh handlers
───────────────────────────────────────────────────────────────── */
function ExportRefreshExample() {
  const [page, setPage] = useState(0);
  const result = paginate(MOCK_PRODUCTS, page, 5);

  const columns: Column<MockProduct>[] = [
    { key: 'name', header: 'Product', hideable: false },
    { key: 'category', header: 'Category' },
    { key: 'sku', header: 'SKU' },
    { key: 'price', header: 'Price', render: (p) => `$${p.price.toFixed(2)}` },
  ];

  return (
    <DataTable<MockProduct>
      columns={columns}
      data={result.items}
      rowKey={(p) => p.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      storageKey="demo-export"
      onExport={(format) => alert(`Export triggered: ${format}`)}
      onRefresh={() => alert('Refresh triggered!')}
    />
  );
}

const EXPORT_REFRESH_CODE = `// Providing onExport activates CSV/Excel/PDF buttons in the settings menu.
// Providing onRefresh activates the auto-refresh interval selector.
// Omitting either renders them as "Coming soon" disabled items.

<DataTable
  storageKey="products"
  onExport={(format) => exportData(format)}   // 'csv' | 'excel' | 'pdf'
  onRefresh={() => refetch()}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   8. Loading State
───────────────────────────────────────────────────────────────── */
function LoadingStateExample() {
  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email' },
    { key: 'firstName', header: 'First Name' },
    { key: 'role', header: 'Role' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={[]}
      rowKey={(u) => u.id}
      loading
      page={0}
      pageSize={5}
      totalElements={0}
      totalPages={0}
      onPageChange={() => undefined}
    />
  );
}

const LOADING_CODE = `// loading={true} replaces the tbody with a centered spinner.
// Use while your query is fetching: loading={isLoading || (isFetching && !data)}

<DataTable
  data={data?.items ?? []}
  loading={isLoading}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   9. Empty State
───────────────────────────────────────────────────────────────── */
function EmptyStateExample() {
  const columns: Column<MockUser>[] = [
    { key: 'email', header: 'Email' },
    { key: 'firstName', header: 'First Name' },
    { key: 'role', header: 'Role' },
  ];

  return (
    <DataTable<MockUser>
      columns={columns}
      data={[]}
      rowKey={(u) => u.id}
      loading={false}
      emptyMessage="No users found matching your filters."
      page={0}
      pageSize={5}
      totalElements={0}
      totalPages={0}
      onPageChange={() => undefined}
    />
  );
}

const EMPTY_CODE = `// data={[]} + loading={false} → shows EmptyState.
// emptyMessage is optional; falls back to the i18n key 'table.noRecords'.

<DataTable
  data={[]}
  loading={false}
  emptyMessage={q ? 'No users match your search.' : 'No users yet.'}
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   11. View Modes (Table vs Cards Grid vs Compact List)
───────────────────────────────────────────────────────────────── */
function ViewModesExample() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const filtered = MOCK_PRODUCTS.filter((p) =>
    [p.name, p.category, p.sku].some((v) => v.toLowerCase().includes(search.toLowerCase())),
  );
  const result = paginate(filtered, page, 6);

  const columns: Column<MockProduct>[] = [
    {
      key: 'name',
      header: 'Product',
      hideable: false,
      render: (p) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent font-bold text-xs">
            {p.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-semibold text-main block">{p.name}</span>
            <span className="text-[11px] text-muted font-mono">{p.sku}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => <Badge tone="blue">{p.category}</Badge>,
    },
    {
      key: 'price',
      header: 'Price',
      render: (p) => <span className="font-bold text-main">${p.price.toFixed(2)}</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => (
        <span className={p.stock === 0 ? 'text-danger font-semibold text-xs' : 'text-xs text-muted'}>
          {p.stock === 0 ? 'Out of stock' : `${p.stock} in stock`}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.active ? 'green' : 'muted'}>
          {p.active ? 'Active' : 'Draft'}
        </Badge>
      ),
    },
  ];

  return (
    <DataTable<MockProduct>
      columns={columns}
      data={result.items}
      rowKey={(p) => p.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={setPage}
      pageSizeOptions={[6, 12, 24]}
      storageKey="demo-view-modes-sample"
      viewModes={['table', 'card', 'list']}
      toolbar={
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(0); }}
          placeholder="Filter products..."
        />
      }
      actions={(p) => (
        <RowMenu
          ariaLabel="Product actions"
          items={[
            { label: 'View Product', onClick: () => alert(`View ${p.name}`), icon: LuEye },
            { label: 'Edit SKU', onClick: () => alert(`Edit ${p.name}`), icon: LuPencil },
            { label: 'Delete Item', onClick: () => alert(`Delete ${p.name}`), icon: LuTrash2, danger: true },
          ]}
        />
      )}
    />
  );
}

const VIEW_MODES_CODE = `import { DataTable, type Column } from 'components/ui/DataTable';

// 1. Opt-in with viewModes prop:
<DataTable
  columns={columns}
  data={products}
  rowKey={(p) => p.id}
  storageKey="catalog-products"
  viewModes={['table', 'card', 'list']}    // enables Table / Cards Grid / Compact List switchers
  toolbar={<SearchInput value={q} onChange={setQ} />}
  actions={(p) => <RowMenu items={...} />}
  // Optional custom card template:
  // cardRender={(item) => <ProductCard product={item} />}
/>

// The user's active view mode choice is automatically persisted
// in localStorage via storageKey: 'catalog-products'`;

/* ─────────────────────────────────────────────────────────────────
   10. Custom tableTools slot
───────────────────────────────────────────────────────────────── */
function TableToolsExample() {
  const [page, setPage] = useState(0);
  const [showActive, setShowActive] = useState(false);

  const filtered = showActive
    ? MOCK_PRODUCTS.filter((p) => p.active)
    : MOCK_PRODUCTS;
  const result = paginate(filtered, page, 5);

  const columns: Column<MockProduct>[] = [
    { key: 'name', header: 'Product', hideable: false },
    { key: 'category', header: 'Category' },
    { key: 'stock', header: 'Stock', render: (p) => (
      <span className={p.stock === 0 ? 'text-danger font-medium' : 'text-main'}>
        {p.stock === 0 ? 'Out of stock' : p.stock}
      </span>
    )},
    { key: 'active', header: 'Active', render: (p) => (
      <Badge tone={p.active ? 'green' : 'muted'}>{p.active ? 'Active' : 'Inactive'}</Badge>
    )},
  ];

  return (
    <DataTable<MockProduct>
      columns={columns}
      data={result.items}
      rowKey={(p) => p.id}
      page={result.page}
      pageSize={result.size}
      totalElements={result.totalElements}
      totalPages={result.totalPages}
      onPageChange={(p) => setPage(p)}
      toolbar={
        <div className="flex items-center gap-2 text-sm text-muted">
          <LuPackage className="h-4 w-4" />
          <span>Products</span>
        </div>
      }
      tableTools={
        <button
          type="button"
          onClick={() => { setShowActive((v) => !v); setPage(0); }}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            showActive
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-glass bg-surface text-muted hover:text-main'
          }`}
        >
          {showActive ? 'Active only ✓' : 'Active only'}
        </button>
      }
    />
  );
}

const TABLE_TOOLS_CODE = `// tableTools renders right of the settings icon (alongside the ⚙ button).
// toolbar renders on the LEFT inside the toolbar area.
// Use tableTools for quick filter toggles or action buttons.

<DataTable
  toolbar={<SearchInput ... />}           // left side
  tableTools={
    <button onClick={toggleFilter}>
      Active only
    </button>
  }                                        // right side (next to ⚙)
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
   12. Virtualized Table (K-56 F2)
   ───────────────────────────────────────────────────────────────── */
interface VirtualRow {
  id: string;
  label: string;
  value: number;
}

// Deterministic 5k rows — enough for the DOM-node difference to be obvious in the inspector.
const VIRTUAL_ROWS: VirtualRow[] = Array.from({ length: 5000 }, (_, i) => ({
  id: String(i),
  label: `Item ${String(i).padStart(4, '0')}`,
  value: (i * 37) % 1000,
}));

function VirtualizedExample() {
  const [virtualized, setVirtualized] = useState(true);

  const columns: Column<VirtualRow>[] = [
    { key: 'label', header: 'Item', hideable: false },
    { key: 'value', header: 'Value' },
    {
      key: 'parity',
      header: 'Parity',
      render: (r) => <Badge tone={r.value % 2 === 0 ? 'green' : 'muted'}>{r.value % 2 === 0 ? 'even' : 'odd'}</Badge>,
    },
  ];

  return (
    <div className="space-y-3">
      <Toggle checked={virtualized} onChange={setVirtualized} label="Virtualized rendering" />
      <DataTable<VirtualRow>
        columns={columns}
        data={VIRTUAL_ROWS}
        rowKey={(r) => r.id}
        page={0}
        pageSize={VIRTUAL_ROWS.length}
        totalElements={VIRTUAL_ROWS.length}
        totalPages={1}
        onPageChange={() => undefined}
        virtualized={virtualized}
        scrollHeight={360}
      />
    </div>
  );
}

const VIRTUALIZED_CODE = `// 5,000 rows, one page. With virtualized the tbody renders only the viewport
// window (~20 rows + overscan) inside its own max-height scroll container with a
// sticky header; without it, all 5,000 <tr> hit the DOM. Toggle the switch and
// watch the DOM node count / scroll jank.

<DataTable
  data={rows}                    // 5,000 rows
  rowKey={(r) => r.id}
  virtualized                    // table mode only; card/list ignore it
  scrollHeight={360}             // max height of the internal scroller
  // rowHeight={49}              // defaults to the density-derived height
  ...
/>`;

/* ─────────────────────────────────────────────────────────────────
    Assembled page
    ───────────────────────────────────────────────────────────────── */
export function DataTableDemoPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-main">DataTable</h1>
        <p className="mt-1 text-sm text-muted">
          Sortable, paginated, personalizable table component. Supports server-side and
          client-side data, custom cell renderers, row actions, toolbar filters, column
          settings, export and auto-refresh hooks, and Table / Card / List multi-mode views.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            'components/ui/DataTable.tsx',
            'Column<T>',
            'DataTableProps<T>',
            'TableViewMode = "table" | "card" | "list"',
            'TableDensity',
            'SortState',
          ].map((s) => (
            <code
              key={s}
              className="rounded-md border border-glass bg-main/[0.03] px-2 py-0.5 font-mono text-muted"
            >
              {s}
            </code>
          ))}
        </div>
      </div>

      <DemoSection
        title="1. Basic"
        description="Minimal setup: columns, data, rowKey, pagination. No sorting, no toolbar, no customization."
        code={BASIC_CODE}
      >
        <BasicExample />
      </DemoSection>

      <DemoSection
        title="2. Sortable Columns"
        description="Providing sort and onSortChange enables click-to-sort column headers. Columns must have sortKey specified."
        code={SORTABLE_CODE}
      >
        <SortableExample />
      </DemoSection>

      <DemoSection
        title="3. Toolbar — Smart Search"
        description="SearchInput supports field-targeted search via the fields prop. The 🔽 picker lets users narrow the search to specific columns. Fields with searchable: false (e.g. enum or computed columns) appear disabled with a 'Not supported' badge. selectedFields=[] means 'All Fields'. storageKey persists the user's field selection in localStorage."
        code={TOOLBAR_CODE}
      >
        <ToolbarExample />
      </DemoSection>

      <DemoSection
        title="4. Column Settings & Density"
        description="Providing a storageKey enables the ⚙ settings icon. Users can hide/show columns and switch row density. Preferences persist in localStorage."
        code={COLUMN_SETTINGS_CODE}
      >
        <ColumnSettingsExample />
      </DemoSection>

      <DemoSection
        title="5. Row Actions (RowMenu)"
        description="Pass an actions render-prop that returns a RowMenu. Items with danger=true render in the destructive tone. Empty items array hides the trigger."
        code={ROW_ACTIONS_CODE}
      >
        <RowActionsExample />
      </DemoSection>

      <DemoSection
        title="6. Custom Cell Renderers"
        description="The render prop on each Column receives the full row and can return any ReactNode — Badge, avatar initials, icons, links, etc."
        code={CUSTOM_RENDERERS_CODE}
      >
        <CustomRenderersExample />
      </DemoSection>

      <DemoSection
        title="7. Export & Refresh"
        description="onExport and onRefresh activate the corresponding tabs in the settings menu. Without them, those options show as 'Coming soon'."
        code={EXPORT_REFRESH_CODE}
      >
        <ExportRefreshExample />
      </DemoSection>

      <DemoSection
        title="8. Loading State"
        description="loading={true} replaces the table body with a centered spinner. Use while data is being fetched."
        code={LOADING_CODE}
      >
        <LoadingStateExample />
      </DemoSection>

      <DemoSection
        title="9. Empty State"
        description="data=[] with loading=false renders the EmptyState component. Provide a contextual emptyMessage (e.g. different copy when a filter is active)."
        code={EMPTY_CODE}
      >
        <EmptyStateExample />
      </DemoSection>

      <DemoSection
        title="10. tableTools — Custom Toolbar Buttons"
        description="tableTools renders on the right side of the toolbar area (alongside ⚙). Use it for quick-filter toggles, view-mode switches, or extra action buttons."
        code={TABLE_TOOLS_CODE}
      >
        <TableToolsExample />
      </DemoSection>

      <DemoSection
        title="11. Table View Modes (Table ↔ Cards Grid ↔ Compact List)"
        description="Passing viewModes={['table', 'card', 'list']} adds one-click segmented view switcher buttons to the toolbar and settings. View selection is automatically persisted in localStorage via storageKey."
        code={VIEW_MODES_CODE}
      >
        <ViewModesExample />
      </DemoSection>

      <DemoSection
        title="12. Virtualized Table (5,000 rows)"
        description="virtualized renders only the viewport window (~20 rows + overscan) inside the table's own max-height scroll container with a sticky header. Toggle it off to feel the 5,000-row DOM. Table view mode only; rowHeight defaults to the density-derived height."
        code={VIRTUALIZED_CODE}
      >
        <VirtualizedExample />
      </DemoSection>
    </div>
  );
}

