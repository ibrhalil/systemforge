import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LuUsers } from 'react-icons/lu';
import { DataTable, type BulkAction, type Column } from '../components/ui/DataTable';
import type { SortState } from '../types';
import { useLocaleStore } from '../store/localeStore';

/**
 * Unit tests for the DataTable primitive (K-39 first tests): sortable headers
 * (aria-sort + onSortChange with the column's sortKey) and the footer pager
 * (prev/next bounds, rows-per-page segments).
 */

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sortKey: 'name' },
  { key: 'note', header: 'Note' }, // not sortable on purpose
];

const rows: Row[] = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Linus' },
];

function renderTable(overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const props = {
    columns,
    data: rows,
    rowKey: (r: Row) => r.id,
    page: 0,
    pageSize: 10,
    totalElements: 25,
    totalPages: 3,
    onPageChange: vi.fn(),
    sort: { field: 'name', direction: 'asc' } satisfies SortState,
    onSortChange: vi.fn(),
    pageSizeOptions: [10, 25, 50],
    onPageSizeChange: vi.fn(),
    ...overrides,
  };
  const result = render(<DataTable<Row> {...props} />);
  return { ...props, container: result.container };
}

describe('DataTable', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  it('renders rows and marks the active sort column via aria-sort', () => {
    renderTable({ sort: { field: 'name', direction: 'desc' } });

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Linus')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    // Non-sortable column: no aria-sort at all.
    expect(screen.getByRole('columnheader', { name: /note/i })).not.toHaveAttribute('aria-sort');
  });

  it('clicking a sortable header reports the sortKey', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    await user.click(screen.getByRole('button', { name: /name/i }));

    expect(props.onSortChange).toHaveBeenCalledWith('name', false);
  });

  it('does not offer sorting for a column without sortKey', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /note/i })).not.toBeInTheDocument();
  });

  it('disables prev on the first page and reports next-page clicks', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(props.onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables next on the last page', () => {
    renderTable({ page: 2 });

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /prev/i })).toBeEnabled();
  });

  it('rows-per-page segments report the chosen size', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '25' }));
    expect(props.onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('renders table settings button when storageKey is provided', async () => {
    renderTable({ storageKey: 'users' });
    expect(screen.getByRole('button', { name: /table settings/i })).toBeInTheDocument();
  });

  it('toggles column visibility and persists to localStorage', async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: 'users' });

    // Open settings menu (defaults to Columns tab)
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    expect(screen.getByText('Customize columns')).toBeInTheDocument();

    // Hide the "Note" column
    const noteCheckbox = screen.getByRole('checkbox', { name: /note/i });
    expect(noteCheckbox).toBeChecked();
    await user.click(noteCheckbox);

    // Note column header is now hidden
    expect(screen.queryByRole('columnheader', { name: /note/i })).not.toBeInTheDocument();

    // Check localStorage persistence
    const stored = JSON.parse(window.localStorage.getItem('sf_table_prefs_users') ?? '{}');
    expect(stored.hiddenColumns).toEqual(['note']);
  });

  it('changes density and persists to localStorage', async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: 'users' });

    // Open settings menu
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    // Switch to Density tab
    await user.click(screen.getByRole('button', { name: /density/i }));

    // Select Compact
    await user.click(screen.getByRole('button', { name: /compact/i }));

    const stored = JSON.parse(window.localStorage.getItem('sf_table_prefs_users') ?? '{}');
    expect(stored.density).toBe('compact');
  });

  it('shows passive export options with Coming soon badge when onExport is not provided', async () => {
    const user = userEvent.setup();
    renderTable({ storageKey: 'users' });

    // Open settings menu
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    // Switch to Export tab
    await user.click(screen.getByRole('button', { name: /export/i }));

    // CSV button is disabled and shows Coming soon
    const csvBtn = screen.getByRole('button', { name: /export csv/i });
    expect(csvBtn).toBeDisabled();
    expect(screen.getAllByText('Coming soon')[0]).toBeInTheDocument();
  });

  it('triggers onExport when provided', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderTable({ storageKey: 'users', onExport });

    // Open settings menu
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    // Switch to Export tab
    await user.click(screen.getByRole('button', { name: /export/i }));

    // Click CSV
    const csvBtn = screen.getByRole('button', { name: /export csv/i });
    expect(csvBtn).toBeEnabled();
    await user.click(csvBtn);
    expect(onExport).toHaveBeenCalledWith('csv');
  });

  it('initializes with hidden columns from localStorage', () => {
    window.localStorage.setItem('sf_table_prefs_users', JSON.stringify({ hiddenColumns: ['note'] }));
    renderTable({ storageKey: 'users' });

    expect(screen.queryByRole('columnheader', { name: /note/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
  });

  it('resets column preferences back to defaults', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('sf_table_prefs_users', JSON.stringify({ hiddenColumns: ['note'] }));
    renderTable({ storageKey: 'users' });

    // Open menu
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    // Click Reset
    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    // Note column is visible again
    expect(screen.getByRole('columnheader', { name: /note/i })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('sf_table_prefs_users') ?? '{}');
    expect(stored.hiddenColumns).toEqual([]);
  });

  it('renders the context empty icon when the table has no rows', () => {
    // react-icons renders no name class — compare the svg's first path instead.
    const { container: iconRef } = render(<LuUsers />);
    const expectedPath = iconRef.querySelector('path')?.getAttribute('d');
    const { container } = renderTable({ data: [], totalElements: 0, totalPages: 0, emptyIcon: LuUsers });

    const emptyIcon = container.querySelector('svg');
    expect(emptyIcon?.querySelector('path')?.getAttribute('d')).toBe(expectedPath);
  });

  it('labels non-hideable columns with the localized Primary badge in the settings menu', async () => {
    const user = userEvent.setup();
    renderTable({
      storageKey: 'users',
      columns: [
        { key: 'name', header: 'Name', sortKey: 'name', hideable: false },
        { key: 'note', header: 'Note' },
      ],
    });

    await user.click(screen.getByRole('button', { name: /table settings/i }));
    expect(screen.getByText('Primary')).toBeInTheDocument();

    // The open menu re-renders with the Turkish label after a locale switch.
    useLocaleStore.setState({ locale: 'tr' });
    await waitFor(() => expect(screen.getByText('Birincil')).toBeInTheDocument());
  });

  /* ── K-49 column filters ── */

  const filterColumns: Column<Row>[] = [
    { key: 'name', header: 'Name', sortKey: 'name' },
    {
      key: 'note',
      header: 'Note',
      filter: { field: 'note', control: 'text' },
    },
  ];

  it('renders no filter trigger when the table has no filter wiring', () => {
    renderTable({ columns: filterColumns });

    expect(screen.queryByRole('button', { name: /filter note/i })).not.toBeInTheDocument();
  });

  it('applies a structured clause from the column filter popover (K-49)', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    renderTable({ columns: filterColumns, filters: [], onFiltersChange });

    // Open the Note column's filter popover
    await user.click(screen.getByRole('button', { name: /filter note/i }));
    // Operator defaults to CONTAINS for text — type a value and apply
    await user.type(await screen.findByLabelText(/value/i), 'urgent');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(onFiltersChange).toHaveBeenCalledWith([
      { field: 'note', operator: 'CONTAINS', values: ['urgent'] },
    ]);
  });

  it('clears an active clause via the popover clear link', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    renderTable({
      columns: filterColumns,
      filters: [{ field: 'note', operator: 'CONTAINS', values: ['urgent'] }],
      onFiltersChange,
    });

    // Active state: the trigger is accent-colored; opening shows Clear
    await user.click(screen.getByRole('button', { name: /filter note/i }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onFiltersChange).toHaveBeenCalledWith([]);
  });

  it('renders the filter popover as a fixed-position body portal (short tables)', async () => {
    const user = userEvent.setup();
    renderTable({ columns: filterColumns, filters: [], onFiltersChange: vi.fn() });

    await user.click(screen.getByRole('button', { name: /filter note/i }));

    // Portaled to body so the table's overflow-x-auto wrapper can never clip it.
    const panel = screen.getByRole('dialog', { name: /filter note/i });
    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe('fixed');
  });

  it('flips the popover above the trigger near the viewport bottom', async () => {
    const user = userEvent.setup();
    renderTable({ columns: filterColumns, filters: [], onFiltersChange: vi.fn() });

    const trigger = screen.getByRole('button', { name: /filter note/i });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 740,
      bottom: 750,
      left: 40,
      right: 52,
      width: 12,
      height: 10,
      x: 40,
      y: 740,
      toJSON: () => ({}),
    } as DOMRect);

    await user.click(trigger);

    const panel = screen.getByRole('dialog', { name: /filter note/i });
    expect(parseFloat(panel.style.top)).toBeLessThan(740); // opened upward
  });

  /* ── K-55 step 1: list states (skeleton / error / fetching) ── */

  it('renders skeleton rows on first load instead of a spinner', () => {
    const { container } = renderTable({ loading: true, data: [] });

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });

  it('renders the error panel with a working retry when the load failed with no data', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderTable({ data: [], totalElements: 0, totalPages: 0, error: new Error('boom'), onRetry });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load results')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error takes precedence over the empty state', () => {
    renderTable({ data: [], totalElements: 0, totalPages: 0, error: new Error('boom') });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('No records')).not.toBeInTheDocument();
  });

  it('keeps rows and shows the fetching bar during a background refetch', () => {
    const { container } = renderTable({ fetching: true });

    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Linus')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  /* ── K-55 F3: row activation (onRowClick) ── */

  it('reports row activation on click and on Enter (table mode)', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick });

    await user.click(screen.getByText('Ada'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    onRowClick.mockClear();
    screen.getByText('Linus').closest('tr')!.focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('rows are not focusable without onRowClick, and action clicks do not activate the row', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    renderTable({
      onRowClick,
      actions: (r) => <button type="button" onClick={() => onAction(r)}>act</button>,
    });

    // The action cell stops propagation — clicking it fires only the action.
    await user.click(screen.getAllByRole('button', { name: 'act' })[0]);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  /* ── K-55 F4: row selection + bulk actions (table mode) ── */

  const bulk = (run: (rows: Row[]) => void): BulkAction<Row>[] => [
    { key: 'activate', label: 'Activate', run: () => undefined },
    { key: 'remove', label: 'Remove', danger: true, run },
  ];

  it('renders no selection column without bulkActions', () => {
    renderTable();
    expect(screen.queryByRole('checkbox', { name: /select all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /select row/i })).not.toBeInTheDocument();
  });

  it('selects rows, shows the bulk bar and runs the action with the selected rows', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    renderTable({ bulkActions: bulk(run) });

    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual([rows[0]]);
  });

  it('header checkbox selects all and toggles back to none', async () => {
    const user = userEvent.setup();
    renderTable({ bulkActions: bulk(vi.fn()) });

    const header = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    await user.click(header);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(header.checked).toBe(true);

    await user.click(header);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shift+click selects the inclusive range', async () => {
    const user = userEvent.setup();
    renderTable({ data: [...rows, { id: '3', name: 'Grace' }], totalElements: 3, totalPages: 1, bulkActions: bulk(vi.fn()) });

    const boxes = screen.getAllByRole('checkbox', { name: 'Select row' });
    await user.click(boxes[0]);
    // user-event does not carry shift on checkbox clicks — dispatch it explicitly.
    fireEvent.click(boxes[2], { shiftKey: true });

    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('clearing the selection hides the bar', async () => {
    const user = userEvent.setup();
    renderTable({ bulkActions: bulk(vi.fn()) });

    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  /* ── K-55 F6: multi-sort header contract + auto-refresh wiring ── */

  it('passes the additive flag on shift+click sortable headers', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    fireEvent.click(screen.getByRole('button', { name: /name/i }), { shiftKey: true });
    expect(onSortChange).toHaveBeenCalledWith('name', true);

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(onSortChange).toHaveBeenLastCalledWith('name', false);
  });

  it('shows multi-sort order badges from the sorts chain', () => {
    renderTable({
      sort: { field: 'name', direction: 'asc' },
      sorts: [{ field: 'name', direction: 'asc' }, { field: 'note', direction: 'desc' }],
      columns: [
        { key: 'name', header: 'Name', sortKey: 'name' },
        { key: 'note', header: 'Note', sortKey: 'note' },
      ],
    });

    expect(screen.getByText('1')).toBeInTheDocument(); // Name = first
    expect(screen.getByText('2')).toBeInTheDocument(); // Note = second
  });

  it('refresh-now and interval selection drive onRefresh', () => {
    vi.useFakeTimers();
    try {
      const onRefresh = vi.fn();
      renderTable({ storageKey: 'users', onRefresh });

      fireEvent.click(screen.getByRole('button', { name: /table settings/i }));
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
      fireEvent.click(screen.getByRole('button', { name: /refresh now/i }));
      expect(onRefresh).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: '30s' }));
      expect(onRefresh).toHaveBeenCalledTimes(2); // selection triggers an immediate refresh
      act(() => vi.advanceTimersByTime(30_000));
      expect(onRefresh).toHaveBeenCalledTimes(3); // interval tick
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DataTable active-filter chips (K-55)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  const filterCols: Column<Row>[] = [
    { key: 'name', header: 'Name', sortKey: 'name', filter: { field: 'name', control: 'text' } },
    { key: 'note', header: 'Note', filter: { field: 'pinned', control: 'boolean' } },
    {
      key: 'grp', header: 'Group',
      filter: { field: 'groupId', control: 'multiselect', options: [{ value: 'g1', label: 'Admins' }] },
    },
  ];

  it('renders one chip per clause and removes a single clause via its X', async () => {
    const onFiltersChange = vi.fn();
    render(
      <DataTable<Row>
        columns={filterCols}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        filters={[
          { field: 'name', operator: 'CONTAINS', values: ['Ada'] },
          { field: 'pinned', operator: 'EQ', values: ['true'] },
        ]}
        onFiltersChange={onFiltersChange}
      />,
    );

    const chips = screen.getByRole('group', { name: /active filters/i });
    expect(withinChips(chips).getByText(/Name/)).toBeInTheDocument();
    expect(withinChips(chips).getByText(/Ada/)).toBeInTheDocument();
    expect(withinChips(chips).getByText(/Note/)).toBeInTheDocument();
    expect(withinChips(chips).getByText(/Yes/)).toBeInTheDocument(); // boolean localized

    fireEvent.click(withinChips(chips).getAllByRole('button', { name: /remove/i })[0]);
    expect(onFiltersChange).toHaveBeenCalledWith([{ field: 'pinned', operator: 'EQ', values: ['true'] }]);
  });

  it('clear-all empties every clause', () => {
    const onFiltersChange = vi.fn();
    render(
      <DataTable<Row>
        columns={filterCols}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        filters={[{ field: 'name', operator: 'CONTAINS', values: ['Ada'] }]}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    expect(onFiltersChange).toHaveBeenCalledWith([]);
  });

  it('resolves static option labels and async loader labels for values', async () => {
    render(
      <DataTable<Row>
        columns={[
          filterCols[2],
          {
            key: 'owner', header: 'Owner',
            filter: { field: 'ownerId', control: 'select', optionsLoader: async () => [{ value: 'u9', label: 'Ada L.' }] },
          },
        ]}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        filters={[
          { field: 'groupId', operator: 'IN', values: ['g1'] },
          { field: 'ownerId', operator: 'EQ', values: ['u9'] },
        ]}
        onFiltersChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Admins/)).toBeInTheDocument(); // static label, not g1
    expect(await screen.findByText(/Ada L\./)).toBeInTheDocument(); // async label
  });

  it('renders no chip row without active filters', () => {
    render(
      <DataTable<Row>
        columns={filterCols}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        filters={[]}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: /active filters/i })).not.toBeInTheDocument();
  });
});

function withinChips(container: HTMLElement) {
  return {
    getByText: (matcher: RegExp | string) => {
      const el = Array.from(container.querySelectorAll('*')).find((n) =>
        typeof matcher === 'string' ? n.textContent === matcher : matcher.test(n.textContent ?? ''),
      );
      if (!el) throw new Error(`no element matching ${matcher} in chips`);
      return el as HTMLElement;
    },
    getAllByRole: (_role: string, opts?: { name?: RegExp }) =>
      Array.from(container.querySelectorAll('button')).filter((b) =>
        !opts?.name || opts.name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
      ) as HTMLElement[],
  };
}

describe('DataTable auto-refresh status chip (K-55)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  it('shows the status chip only while an interval is active (also without filters)', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderTable({ storageKey: 'refresh-chip-t', onRefresh });

    expect(screen.queryByText(/Auto: /)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /table settings/i }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: '30s' }));

    expect(screen.getByText('Auto: 30s')).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalled(); // picking an interval refreshes immediately

    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(screen.queryByText(/Auto: /)).not.toBeInTheDocument();
  });

  it('renders beside the filter chips when both are live', async () => {
    const user = userEvent.setup();
    renderTable({
      storageKey: 'refresh-chip-t',
      onRefresh: vi.fn(),
      filters: [{ field: 'name', operator: 'CONTAINS', values: ['Ada'] }],
      onFiltersChange: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: /table settings/i }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: '1m' }));

    expect(screen.getByText('Auto: 1:00')).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: /active filters/i });
    expect(withinChips(chips).getByText(/Ada/)).toBeTruthy(); // filter chip still visible
  });

  it('counts down each second and fires onRefresh at zero, refilling the countdown', () => {
    vi.useFakeTimers();
    try {
      const onRefresh = vi.fn();
      renderTable({ storageKey: 'refresh-count-t', onRefresh });

      fireEvent.click(screen.getByRole('button', { name: /table settings/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      fireEvent.click(screen.getByRole('button', { name: '30s' }));
      expect(onRefresh).toHaveBeenCalledTimes(1); // interval selection fires immediately
      expect(screen.getByText('Auto: 30s')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByText('Auto: 29s')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(29_000));
      expect(onRefresh).toHaveBeenCalledTimes(2); // countdown reached zero → refresh
      expect(screen.getByText('Auto: 30s')).toBeInTheDocument(); // refilled
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking the chip refreshes now and resets the countdown', () => {
    vi.useFakeTimers();
    try {
      const onRefresh = vi.fn();
      renderTable({ storageKey: 'refresh-click-t', onRefresh });

      fireEvent.click(screen.getByRole('button', { name: /table settings/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      fireEvent.click(screen.getByRole('button', { name: '30s' }));
      // Close the menu — its "Refresh now" button would collide with the chip's aria-label.
      fireEvent.click(screen.getByRole('button', { name: /table settings/i }));

      act(() => vi.advanceTimersByTime(10_000));
      expect(screen.getByText('Auto: 20s')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
      expect(onRefresh).toHaveBeenCalledTimes(2); // interval selection + manual click
      expect(screen.getByText('Auto: 30s')).toBeInTheDocument(); // countdown refilled
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DataTable hardening (K-55 Phase 1-3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  /* ── Phase 1: hiddenColumns persistence reconciliation ── */

  it('drops stale keys and applies valid hidden columns from storage', () => {
    window.localStorage.setItem(
      'sf_table_prefs_stale-key-test',
      JSON.stringify({ hiddenColumns: ['note', 'stale-key'] }),
    );

    renderTable({ storageKey: 'stale-key-test' });

    expect(screen.queryByRole('columnheader', { name: /note/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
  });

  it('renders hideable:false columns even if listed in stored hiddenColumns', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'sf_table_prefs_non-hideable-test',
      JSON.stringify({ hiddenColumns: ['name', 'note'] }),
    );

    renderTable({
      storageKey: 'non-hideable-test',
      columns: [
        { key: 'name', header: 'Name', hideable: false },
        { key: 'note', header: 'Note' },
      ],
    });

    // Name has hideable: false, so it still renders
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    // Note is hideable and was in hiddenColumns, so it is hidden
    expect(screen.queryByRole('columnheader', { name: /note/i })).not.toBeInTheDocument();

    // Check settings menu checkbox for Name
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    const nameCheckbox = screen.getByRole('checkbox', { name: /name/i });
    expect(nameCheckbox).toBeChecked();
    expect(nameCheckbox).toBeDisabled();
  });

  it('keeps at least one column visible when storage hides all hideable columns', () => {
    window.localStorage.setItem(
      'sf_table_prefs_all-hidden-test',
      JSON.stringify({ hiddenColumns: ['name', 'note'] }),
    );

    renderTable({
      storageKey: 'all-hidden-test',
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'note', header: 'Note' },
      ],
    });

    // At least one column still renders
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  /* ── Phase 2: selection lifecycle (key-signature semantics) ── */

  it('preserves selection on rerender with new array reference containing same rows', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[{ key: 'act', label: 'Action', run: vi.fn() }]}
      />,
    );

    // Select first row
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    // Rerender with a NEW array reference containing the same rows
    rerender(
      <DataTable<Row>
        columns={columns}
        data={[...rows]}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[{ key: 'act', label: 'Action', run: vi.fn() }]}
      />,
    );

    // Selection must be preserved
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('clears selection when data changes to different rows', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[{ key: 'act', label: 'Action', run: vi.fn() }]}
      />,
    );

    // Select first row
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument();

    // Rerender with DIFFERENT rows
    const differentRows: Row[] = [
      { id: '3', name: 'Grace' },
      { id: '4', name: 'Alan' },
    ];
    rerender(
      <DataTable<Row>
        columns={columns}
        data={differentRows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[{ key: 'act', label: 'Action', run: vi.fn() }]}
      />,
    );

    // Selection must be cleared
    expect(screen.queryByRole('toolbar', { name: /bulk actions/i })).not.toBeInTheDocument();
  });

  it('clears selection when leaving table mode and keeps it cleared when switching back', async () => {
    const user = userEvent.setup();
    render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        viewModes={['table', 'card']}
        bulkActions={[{ key: 'act', label: 'Action', run: vi.fn() }]}
      />,
    );

    // Select row in table mode
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument();

    // Switch to Cards view
    await user.click(screen.getByRole('button', { name: /cards/i }));
    expect(screen.queryByRole('toolbar', { name: /bulk actions/i })).not.toBeInTheDocument();

    // Switch back to Table view
    await user.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.queryByRole('toolbar', { name: /bulk actions/i })).not.toBeInTheDocument();
  });

  /* ── Phase 3: bulk-confirm stale-row guard ── */

  it('closes dialog without running when selected row is no longer in data', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const { rerender } = render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[
          {
            key: 'delete',
            label: 'Delete',
            danger: true,
            confirm: { title: 'Delete rows?', message: 'Are you sure?' },
            run,
          },
        ]}
      />,
    );

    // Select row 1 ('Ada') and click Delete
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // Confirm dialog is open
    expect(screen.getByText('Delete rows?')).toBeInTheDocument();

    // Rerender with data that no longer contains 'Ada' (e.g. only Linus)
    rerender(
      <DataTable<Row>
        columns={columns}
        data={[{ id: '2', name: 'Linus' }]}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={1}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[
          {
            key: 'delete',
            label: 'Delete',
            danger: true,
            confirm: { title: 'Delete rows?', message: 'Are you sure?' },
            run,
          },
        ]}
      />,
    );

    // Click Confirm
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    // run NOT called and dialog is closed
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete rows?')).not.toBeInTheDocument();
  });

  it('runs with surviving rows and fresh object identity on confirm', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const initialRows: Row[] = [
      { id: '1', name: 'Ada (stale)' },
      { id: '2', name: 'Linus (stale)' },
    ];
    const { rerender } = render(
      <DataTable<Row>
        columns={columns}
        data={initialRows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[
          {
            key: 'delete',
            label: 'Delete',
            danger: true,
            confirm: { title: 'Delete rows?', message: 'Are you sure?' },
            run,
          },
        ]}
      />,
    );

    // Select both rows and click Delete
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
    await user.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete rows?')).toBeInTheDocument();

    // Data refetched while dialog is open: row 1 dropped, row 2 updated with fresh object
    const freshLinus: Row = { id: '2', name: 'Linus (fresh)' };
    rerender(
      <DataTable<Row>
        columns={columns}
        data={[freshLinus]}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={1}
        totalPages={1}
        onPageChange={vi.fn()}
        bulkActions={[
          {
            key: 'delete',
            label: 'Delete',
            danger: true,
            confirm: { title: 'Delete rows?', message: 'Are you sure?' },
            run,
          },
        ]}
      />,
    );

    // Click Confirm
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toHaveLength(1);
    // Exact object identity from current data array
    expect(run.mock.calls[0][0][0]).toBe(freshLinus);
    expect(screen.queryByText('Delete rows?')).not.toBeInTheDocument();
  });
});

describe('DataTable hardening (K-55 Phase 4-6)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  /* ── Phase 4: Sort chain visual & aria alignment ── */

  it('renders multi-sort secondary column direction glyph and aria-sort', () => {
    renderTable({
      sorts: [
        { field: 'name', direction: 'asc' },
        { field: 'note', direction: 'desc' },
      ],
      columns: [
        { key: 'name', header: 'Name', sortKey: 'name' },
        { key: 'note', header: 'Note', sortKey: 'note' },
        { key: 'extra', header: 'Extra', sortKey: 'extra' }, // sortable but not in chain
      ],
    });

    const nameTh = screen.getByRole('columnheader', { name: /name/i });
    const noteTh = screen.getByRole('columnheader', { name: /note/i });
    const extraTh = screen.getByRole('columnheader', { name: /extra/i });

    expect(nameTh).toHaveAttribute('aria-sort', 'ascending');
    expect(noteTh).toHaveAttribute('aria-sort', 'descending');
    expect(extraTh).not.toHaveAttribute('aria-sort');

    // Direction glyphs: Name has ▲, Note has ▼
    expect(nameTh.textContent).toContain('▲');
    expect(noteTh.textContent).toContain('▼');
  });

  /* ── Phase 5: viewMode controlled contract & clamping & errorIcon ── */

  it('controlled viewMode fires onViewModeChange and does not write to localStorage', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    const { rerender } = render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        viewModes={['table', 'card']}
        viewMode="table"
        onViewModeChange={onViewModeChange}
        storageKey="controlled-test"
      />,
    );

    // Initial render in table mode
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Click card mode button in switcher
    const cardBtn = screen.getByRole('button', { name: /cards/i });
    await user.click(cardBtn);

    expect(onViewModeChange).toHaveBeenCalledWith('card');
    // LocalStorage should NOT have viewMode saved
    const stored = JSON.parse(window.localStorage.getItem('sf_table_prefs_controlled-test') ?? '{}');
    expect(stored.viewMode).toBeUndefined();

    // Re-rendering with controlled prop changes mode
    rerender(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        viewModes={['table', 'card']}
        viewMode="card"
        onViewModeChange={onViewModeChange}
        storageKey="controlled-test"
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('clamps invalid persisted viewMode to first available viewMode', () => {
    window.localStorage.setItem(
      'sf_table_prefs_clamp-test',
      JSON.stringify({ viewMode: 'card' }),
    );

    render(
      <DataTable<Row>
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
        viewModes={['table', 'list']} // 'card' is not allowed
        storageKey="clamp-test"
      />,
    );

    // Fallback to 'table'
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders custom errorIcon when error occurs', () => {
    const { container: iconRef } = render(<LuUsers />);
    const expectedPath = iconRef.querySelector('path')?.getAttribute('d');

    const { container } = renderTable({
      data: [],
      totalElements: 0,
      totalPages: 0,
      error: new Error('boom'),
      errorIcon: LuUsers,
    });

    const errorAlert = container.querySelector('[role="alert"]');
    expect(errorAlert).toBeInTheDocument();
    const errorSvg = errorAlert?.querySelector('svg');
    expect(errorSvg?.querySelector('path')?.getAttribute('d')).toBe(expectedPath);
  });

  /* ── Phase 6: cellText helper auto-render ── */

  it('renders empty string for missing column key without error', () => {
    render(
      <DataTable<Row>
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'nonexistentField', header: 'Missing' },
        ]}
        data={rows}
        rowKey={(r) => r.id}
        page={0}
        pageSize={10}
        totalElements={2}
        totalPages={1}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Ada')).toBeInTheDocument();
    // Headers exist
    expect(screen.getByRole('columnheader', { name: /missing/i })).toBeInTheDocument();
  });
});

describe('DataTable virtualization (K-56 F2)', () => {
  const bigRows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}` }));

  function renderVirtual(overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
    return renderTable({
      data: bigRows,
      pageSize: 100,
      totalElements: 100,
      totalPages: 1,
      virtualized: true,
      scrollHeight: 480,
      ...overrides,
    });
  }

  const dataRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('tbody tr')).filter(
      (tr) => !tr.hasAttribute('aria-hidden'),
    ) as HTMLElement[];
  const spacerRows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('tbody tr[aria-hidden]')) as HTMLElement[];

  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
  });

  it('renders only the viewport window with spacer rows (default density rowHeight 49)', () => {
    const { container } = renderVirtual();

    // viewport 480 / 49px rows -> 10 visible + 4 overscan below = 14 rendered rows.
    expect(dataRows(container).length).toBe(14);
    expect(spacerRows(container).length).toBe(1); // top spacer is 0 at scrollTop 0
    expect(dataRows(container)[0]).toHaveTextContent('Row 0');
    expect(dataRows(container)[13]).toHaveTextContent('Row 13');
    expect(spacerRows(container)[0].style.height).toBe(`${(100 - 1 - 13) * 49}px`);
  });

  it('renders every row when virtualized is off', () => {
    const { container } = renderTable({ data: bigRows, pageSize: 100, totalElements: 100, totalPages: 1 });

    expect(dataRows(container).length).toBe(100);
    expect(spacerRows(container).length).toBe(0);
  });

  it('moves the window on scroll and forces row height', () => {
    const { container } = renderVirtual();
    const scroller = container.querySelector('div.overflow-auto');
    expect(scroller).not.toBeNull();

    Object.defineProperty(scroller, 'scrollTop', { value: 40 * 49, configurable: true });
    fireEvent.scroll(scroller!);

    const rendered = dataRows(container);
    // start = 40 - 4 = 36, end = 53 (10 viewport rows + 4 overscan each side).
    expect(rendered.length).toBe(18);
    expect(rendered[0]).toHaveTextContent('Row 36');
    expect(rendered[17]).toHaveTextContent('Row 53');
    expect(spacerRows(container)[0].style.height).toBe(`${36 * 49}px`);
    expect(rendered[0].style.height).toBe('49px');
  });

  it('honors a custom rowHeight', () => {
    const { container } = renderVirtual({ rowHeight: 40 });

    // 480/40 = 12 viewport rows + 4 overscan below = 16.
    expect(dataRows(container).length).toBe(16);
    expect(dataRows(container)[0].style.height).toBe('40px');
  });

  it('ignores virtualization in card view mode', () => {
    const { container } = renderVirtual({ viewModes: ['card', 'table'], viewMode: 'card' });

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getAllByText(/Row \d+/).length).toBe(100);
  });
});
