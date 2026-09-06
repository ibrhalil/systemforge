import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LuChevronsUpDown,
  LuColumns3,
  LuDownload,
  LuLayoutGrid,
  LuList,
  LuRefreshCw,
  LuRotateCw,
  LuRows3,
  LuSlidersHorizontal,
  LuTable2,
  LuTriangleAlert,
} from 'react-icons/lu';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';
import type { IconType } from 'react-icons';
import {
  loadTablePreferences,
  saveTablePreferences,
  type TableViewMode,
} from '../../lib/tablePreferences';
import type { FilterCriteria, SavedViewPrefs, SortState } from '../../types';
import { useVirtualList } from '../../lib/useVirtualList';
import { Badge } from './Badge';
import { Button } from './Button';
import { ColumnFilterButton, type ColumnFilterSpec } from './ColumnFilterButton';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { FilterChips, RefreshStatusChip } from './FilterChips';
import { TablePagination } from './TablePagination';
import { MICRO_LABEL } from './styles';

export type { TableViewMode };

export interface Column<T> {
  /**
   * Unique column identifier. For auto-render (no `render`), this must be a field present
   * on the row object. Composite/virtual columns (key is not a row field) MUST provide
   * `render` — see RecordTable's dynamic property columns.
   */
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  /**
   * Backend field this column sorts by; distinct from `key` on composite columns
   * (users "name" sorts by `email`). Must be in the feature's sort whitelist or the
   * request 400s.
   */
  sortKey?: string;
  /** Structured column filter (K-49) — renders a popover when the table receives `filters`/`onFiltersChange`. */
  filter?: ColumnFilterSpec;
  /** Whether the user can hide this column (default true; false for essential primary columns). */
  hideable?: boolean;
}

export type TableDensity = 'compact' | 'normal' | 'relaxed';

/** A bulk-bar action over the currently selected rows (K-55 F4). */
export interface BulkAction<T> {
  key: string;
  label: string;
  danger?: boolean;
  /** Present → a ConfirmDialog guards the run (destructive actions). */
  confirm?: { title: string; message: string };
  run: (rows: T[]) => void | Promise<void>;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** First load (no data yet) — renders skeleton rows instead of a spinner. */
  loading?: boolean;
  /** Background refetch with rows on screen — keeps rows, shows the thin top bar. */
  fetching?: boolean;
  /** Truthy with no rows renders the error panel; precedence: error > empty. */
  error?: unknown;
  /** Retry handler for the error panel (TanStack `refetch`). */
  onRetry?: () => void;
  emptyMessage?: string;
  page: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Rows-per-page choices; omit (or omit {@link onPageSizeChange}) for fixed-size pages. */
  pageSizeOptions?: readonly number[];
  /** Called with the newly chosen rows-per-page value. Pages should reset to page 0. */
  onPageSizeChange?: (size: number) => void;
  /** Active sort (single-column). Omitted/undefined when the caller has no sorting. */
  sort?: SortState;
  /** Click handler on a sortable header — receives the column's `sortKey` and whether
   *  the click was additive (Shift) — multi-sort chains. */
  onSortChange?: (field: string, additive?: boolean) => void;
  /** Full multi-sort chain; drives the per-column order badges. */
  sorts?: SortState[];
  /** Row activation (click / Enter / Space, table mode) — opens the row-detail surface. */
  onRowClick?: (row: T) => void;
  /** Bulk operations over the selected rows; providing them enables the selection column (table mode). */
  bulkActions?: BulkAction<T>[];
  /** Active structured filter clauses (K-49) — omitted means no column renders a filter trigger. */
  filters?: FilterCriteria[];
  /** Called with the full clause list after a column filter is applied or cleared. */
  onFiltersChange?: (filters: FilterCriteria[]) => void;
  actions?: (row: T) => ReactNode;
  actionsHeader?: string;
  /** Filter/toolbar area rendered above the table — per-page search, selects, quick actions. */
  toolbar?: ReactNode;
  /** localStorage key persisting table preferences (hidden columns, density, viewMode). */
  storageKey?: string;
  /** Whether view customization is enabled; defaults to true when storageKey is provided. */
  customizableColumns?: boolean;
  /** Export handler; omitted renders the export options disabled ("Coming soon"). */
  onExport?: (format: 'csv' | 'excel' | 'pdf') => void;
  /** Manual refresh handler; omitted renders the refresh options disabled ("Coming soon"). */
  onRefresh?: () => void;
  /** Custom toolbar action buttons rendered alongside the table controls. */
  tableTools?: ReactNode;
  /** Supported view modes; more than one renders the view switcher toggle. */
  viewModes?: TableViewMode[];
  /** Controlled view mode; omitted = internal state persisted via storageKey. */
  viewMode?: TableViewMode;
  /** Called when the view mode changes. */
  onViewModeChange?: (mode: TableViewMode) => void;
  /** Custom 'card' renderer; omitted = structured auto-card from visible columns. */
  cardRender?: (row: T) => ReactNode;
  /** Custom 'list' renderer. */
  listRender?: (row: T) => ReactNode;
  /** Empty-state icon (defaults to EmptyState's generic folder). */
  emptyIcon?: IconType;
  /** Error-state icon (defaults to LuTriangleAlert). */
  errorIcon?: IconType;
  /**
   * External prefs snapshot (saved view, K-56 F3): applied whenever `nonce`
   * changes. Ephemeral by design — not written to localStorage; the user's own
   * stored preferences remain the reload baseline.
   */
  appliedPrefs?: { nonce: number; prefs: SavedViewPrefs } | null;
  /**
   * Virtualization (K-56 F2, table mode only): tbody renders a fixed-row-height
   * window inside the table's own vertical scroll container. Assumes single-line
   * uniform rows; card/list modes ignore this.
   */
  virtualized?: boolean;
  /** Uniform row height in px; defaults to the density-derived natural height. */
  rowHeight?: number;
  /** Max height of the internal vertical scroll container in px (default 480). */
  scrollHeight?: number;
}


type SettingsTab = 'columns' | 'density' | 'export' | 'refresh';

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  fetching = false,
  error,
  onRetry,
  emptyMessage,
  page,
  pageSize,
  totalElements,
  totalPages,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  sort,
  onSortChange,
  sorts,
  onRowClick,
  bulkActions,
  filters,
  onFiltersChange,
  actions,
  actionsHeader,
  toolbar,
  storageKey,
  customizableColumns = true,
  onExport,
  onRefresh,
  tableTools,
  viewModes,
  viewMode: controlledViewMode,
  onViewModeChange,
  cardRender,
  listRender,
  emptyIcon,
  errorIcon,
  virtualized = false,
  rowHeight,
  scrollHeight,
  appliedPrefs,
}: DataTableProps<T>) {
  const { t } = useT();

  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    if (!storageKey) return [];
    return loadTablePreferences(storageKey).hiddenColumns ?? [];
  });
  const [density, setDensity] = useState<TableDensity>(() => {
    if (!storageKey) return 'normal';
    const pref = loadTablePreferences(storageKey).density;
    return (['compact', 'normal', 'relaxed'] as const).includes(pref as TableDensity) ? (pref as TableDensity) : 'normal';
  });
  const [internalViewMode, setInternalViewMode] = useState<TableViewMode>(() => {
    if (!storageKey) return viewModes?.[0] ?? 'table';
    return (loadTablePreferences(storageKey).viewMode as TableViewMode) ?? viewModes?.[0] ?? 'table';
  });

  // Clamp uncontrolled mode: a stale persisted mode not in viewModes falls back to viewModes[0].
  const activeViewMode =
    controlledViewMode ??
    (viewModes && !viewModes.includes(internalViewMode) ? viewModes[0] ?? 'table' : internalViewMode);

  // Saved-view prefs application (K-56 F3): re-applied on every nonce change; the
  // effectiveHiddenColumns memo still enforces hideable:false + one-visible rules.
  const appliedPrefsNonce = useRef(-1);
  useEffect(() => {
    if (!appliedPrefs || appliedPrefs.nonce === appliedPrefsNonce.current) return;
    appliedPrefsNonce.current = appliedPrefs.nonce;
    setHiddenColumns(appliedPrefs.prefs.hiddenColumns ?? []);
    setDensity(appliedPrefs.prefs.density ?? 'normal');
  }, [appliedPrefs]);


  const effectiveHiddenColumns = useMemo(() => {
    const hideableCols = columns.filter((c) => c.hideable !== false);
    const validHidden = hiddenColumns.filter((k) => hideableCols.some((c) => c.key === k));
    const hasNonHideable = columns.some((c) => c.hideable === false);
    if (!hasNonHideable && validHidden.length >= hideableCols.length && hideableCols.length > 0) {
      return hideableCols.slice(0, -1).map((c) => c.key);
    }
    return validHidden;
  }, [columns, hiddenColumns]);

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('columns');
  const [refreshMs, setRefreshMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);

  // Auto-refresh (K-55 F6): a 1s countdown owns the interval — reaching zero fires
  // onRefresh and refills. The remaining truth lives in a ref so the chip's manual
  // trigger can reset the SAME countdown the interval uses; `remainingMs` state only
  // mirrors it for display. The latest-ref keeps the subscription stable across the
  // caller's inline closures; side effects stay out of state updaters (StrictMode-safe).
  const onRefreshRef = useRef(onRefresh);
  const remainingRef = useRef(0);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  useEffect(() => {
    if (!refreshMs) return;
    remainingRef.current = refreshMs;
    setRemainingMs(refreshMs);
    const id = setInterval(() => {
      remainingRef.current -= 1000;
      if (remainingRef.current <= 0) {
        remainingRef.current = refreshMs;
        onRefreshRef.current?.();
      }
      setRemainingMs(remainingRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [refreshMs]);

  /** Immediate refresh with the countdown refilled — the chip click and the settings "refresh now" share it. */
  const triggerRefreshNow = () => {
    if (!onRefresh) return;
    remainingRef.current = refreshMs;
    setRemainingMs(refreshMs);
    onRefreshRef.current?.();
  };

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettingsMenu) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setShowSettingsMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettingsMenu(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showSettingsMenu]);

  const visibleColumns = useMemo(() => {
    return columns.filter((col) => !effectiveHiddenColumns.includes(col.key));
  }, [columns, effectiveHiddenColumns]);

  const colCount = visibleColumns.length + (actions ? 1 : 0) + (bulkActions?.length ? 1 : 0);

  // ── Row selection (K-55 F4): ephemeral by design — selection is bound to the
  //    current row-key set. Any data change that produces a DIFFERENT key set (page/
  //    filter/sort refetch with different rows) clears it. A same-key-set refetch
  //    (auto-refresh returning identical rows) preserves selection. Shift+Click ranges.
  const selectionEnabled = !!bulkActions?.length;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingConfirm, setPendingConfirm] = useState<{ action: BulkAction<T>; rows: T[] } | null>(null);
  const lastClickedIndex = useRef<number | null>(null);

  const dataSignature = useMemo(() => data.map(rowKey).join('\u0000'), [data, rowKey]);
  const prevSignatureRef = useRef<string>('');
  useEffect(() => {
    if (prevSignatureRef.current && dataSignature !== prevSignatureRef.current) {
      setSelected((prev) => (prev.size > 0 ? new Set() : prev));
      lastClickedIndex.current = null;
    }
    prevSignatureRef.current = dataSignature;
  }, [dataSignature]);

  useEffect(() => {
    if (activeViewMode !== 'table') {
      setSelected((prev) => (prev.size > 0 ? new Set() : prev));
      lastClickedIndex.current = null;
    }
  }, [activeViewMode]);

  const selectedRows = useMemo(
    () => data.filter((row) => selected.has(rowKey(row))),
    [data, selected, rowKey],
  );

  const allSelected = selectionEnabled && data.length > 0 && selectedRows.length === data.length;
  const someSelected = selectionEnabled && selected.size > 0;

  const toggleRow = useCallback(
    (row: T, index: number, shiftKey: boolean) => {
      // Capture BEFORE enqueueing: React defers the updater to render time, after the
      // ref below has already been mutated to this click's index.
      const last = lastClickedIndex.current;
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && last != null) {
          const [from, to] = [last, index].sort((a, b) => a - b);
          data.slice(from, to + 1).forEach((r) => next.add(rowKey(r)));
        } else if (next.has(rowKey(row))) {
          next.delete(rowKey(row));
        } else {
          next.add(rowKey(row));
        }
        return next;
      });
      lastClickedIndex.current = index;
    },
    [data, rowKey],
  );


  const toggleAll = () => {
    setSelected(() => (allSelected ? new Set() : new Set(data.map(rowKey))));
    lastClickedIndex.current = null;
  };

  const runBulkAction = (action: BulkAction<T>) => {
    if (action.confirm) {
      setPendingConfirm({ action, rows: selectedRows });
      return;
    }
    void action.run(selectedRows);
  };

  const skeletonRows = Math.min(Math.max(pageSize, 3), 8);
  const showSkeleton = loading && data.length === 0;
  const showError = !!error && !loading && data.length === 0;
  const showFetchingBar = fetching && !loading && data.length > 0;

  const isCustomizationEnabled = !!storageKey && customizableColumns;
  const hasActivePreferences =
    effectiveHiddenColumns.length > 0 || density !== 'normal' || (viewModes && activeViewMode !== (viewModes[0] ?? 'table'));

  const toggleColumnVisibility = (colKey: string) => {
    const isHidden = hiddenColumns.includes(colKey);
    let nextHidden: string[];
    if (isHidden) {
      nextHidden = hiddenColumns.filter((k) => k !== colKey);
    } else {
      if (visibleColumns.length <= 1) return; // Keep at least one column visible
      nextHidden = [...hiddenColumns, colKey];
    }
    setHiddenColumns(nextHidden);
    if (storageKey) {
      saveTablePreferences(storageKey, { hiddenColumns: nextHidden });
    }
  };

  const handleResetColumns = () => {
    setHiddenColumns([]);
    if (storageKey) {
      saveTablePreferences(storageKey, { hiddenColumns: [] });
    }
  };

  const handleDensityChange = (newDensity: TableDensity) => {
    setDensity(newDensity);
    if (storageKey) {
      saveTablePreferences(storageKey, { density: newDensity });
    }
  };

  const handleViewModeChange = (newMode: TableViewMode) => {
    // Controlled: parent is source of truth — no internal state / localStorage write.
    if (controlledViewMode !== undefined) {
      onViewModeChange?.(newMode);
      return;
    }
    setInternalViewMode(newMode);
    if (storageKey) {
      saveTablePreferences(storageKey, { viewMode: newMode });
    }
    onViewModeChange?.(newMode);
  };

  const sortable = (col: Column<T>): boolean => !!col.sortKey && !!onSortChange;

  const columnFilterEnabled = (col: Column<T>): boolean =>
    !!col.filter && filters !== undefined && !!onFiltersChange;

  const activeFilterFor = (col: Column<T>): FilterCriteria | undefined =>
    filters?.find((f) => f.field === col.filter?.field);

  const handleFilterChange = (col: Column<T>, criteria: FilterCriteria | null) => {
    if (!col.filter) return;
    const rest = (filters ?? []).filter((f) => f.field !== col.filter!.field);
    onFiltersChange?.(criteria ? [...rest, criteria] : rest);
  };

  const headerContent = (col: Column<T>) => {
    const label =
      !sortable(col) ? (
        col.header
      ) : (
        (() => {
          // Use chain entry for this column (from sorts[] if provided, else fall back to sort).
          const chain = sorts ?? (sort ? [sort] : []);
          const chainEntry = chain.find((s) => s.field === col.sortKey);
          const chainIndex = chain.findIndex((s) => s.field === col.sortKey);
          const showsIndex = !!sorts && sorts.length > 1 && chainIndex >= 0;
          return (
            <button
              type="button"
              onClick={(e) => onSortChange?.(col.sortKey!, e.shiftKey)}
              className="group inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-main"
              title={col.header}
            >
              {col.header}
              {showsIndex && (
                <span className="text-[9px] font-semibold leading-none text-accent" aria-hidden>
                  {chainIndex + 1}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  'leading-none',
                  chainEntry ? 'text-[10px] text-accent' : 'text-muted/50 group-hover:text-muted',
                )}
              >
                {chainEntry ? (
                  chainEntry.direction === 'asc' ? '▲' : '▼'
                ) : (
                  <LuChevronsUpDown className="h-3 w-3" />
                )}
              </span>
            </button>
          );
        })()
      );
    if (!columnFilterEnabled(col)) return label;
    return (
      <span className="inline-flex items-center gap-1">
        <ColumnFilterButton
          spec={col.filter!}
          header={col.header}
          active={activeFilterFor(col)}
          onChange={(criteria) => handleFilterChange(col, criteria)}
        />
        {label}
      </span>
    );
  };

  const ariaSort = (col: Column<T>): 'ascending' | 'descending' | undefined => {
    if (!sortable(col)) return undefined;
    // Check chain entry (covers both primary and secondary multi-sort columns).
    const chain = sorts ?? (sort ? [sort] : []);
    const chainEntry = chain.find((s) => s.field === col.sortKey);
    if (!chainEntry) return undefined;
    return chainEntry.direction === 'asc' ? 'ascending' : 'descending';
  };


  const thPadding =
    density === 'compact' ? 'px-3 py-2 text-[11px]' : density === 'relaxed' ? 'px-5 py-3.5 text-sm' : 'px-4 py-3 text-xs';
  const tdPadding =
    density === 'compact' ? 'px-3 py-2 text-xs' : density === 'relaxed' ? 'px-5 py-4 text-base' : 'px-4 py-3.5 text-sm';

  // ── Virtualization (K-56 F2): table mode only. Row height is forced on rendered
  //    rows so the window math matches the DOM exactly; viewport measurement reads
  //    the container's clientHeight (jsdom reports 0 — falls back to the configured
  //    max so tests stay deterministic without ResizeObserver).
  const virtualScrollMax = scrollHeight ?? 480;
  const effectiveRowHeight = rowHeight ?? (density === 'compact' ? 33 : density === 'relaxed' ? 57 : 49);
  const isVirtualized = virtualized && activeViewMode === 'table';
  const stickyTh = isVirtualized ? 'sticky top-0 z-20 border-b border-glass bg-bg' : '';

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [vScrollTop, setVScrollTop] = useState(0);
  const [vViewport, setVViewport] = useState(0);

  const syncVirtualViewport = (el: HTMLElement) => {
    const next = el.clientHeight || virtualScrollMax;
    setVViewport((prev) => (prev === next ? prev : next));
  };

  const handleVirtualScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setVScrollTop(e.currentTarget.scrollTop);
    syncVirtualViewport(e.currentTarget);
  };

  // Paging swaps the dataset — snap the window back to the top.
  useEffect(() => {
    if (!isVirtualized) return;
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    setVScrollTop(0);
  }, [page, isVirtualized]);

  const vWindow = useVirtualList({
    itemCount: data.length,
    rowHeight: effectiveRowHeight,
    scrollTop: vScrollTop,
    viewportHeight: vViewport,
  });
  const windowedData = isVirtualized ? data.slice(vWindow.startIndex, vWindow.endIndex + 1) : data;
  const windowBaseIndex = isVirtualized ? vWindow.startIndex : 0;

  return (
    <div
      className="relative rounded-lg border border-glass bg-surface shadow-sm shadow-black/[0.03]"
      aria-busy={loading || fetching}
    >
      {showFetchingBar && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse rounded-t-lg bg-accent/50"
        />
      )}
      {(toolbar || isCustomizationEnabled || tableTools || (viewModes && viewModes.length > 1)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-glass bg-bg/40 px-4 py-2.5">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {toolbar}
          </div>

          <div className="flex items-center gap-2">
            {viewModes && viewModes.length > 1 && (
              <div
                className="flex items-center rounded-md border border-glass bg-bg/50 p-0.5"
                role="group"
                aria-label={t('table.viewMode')}
              >
                {viewModes.map((mode) => {
                  const isSelected = activeViewMode === mode;
                  const Icon = mode === 'table' ? LuTable2 : mode === 'card' ? LuLayoutGrid : LuList;
                  const label =
                    mode === 'table'
                      ? t('table.viewModeTable')
                      : mode === 'card'
                      ? t('table.viewModeCard')
                      : t('table.viewModeList');
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleViewModeChange(mode)}
                      className={cn(
                        'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                        isSelected
                          ? 'bg-surface font-semibold text-accent shadow-xs'
                          : 'text-muted hover:text-main',
                      )}
                      title={label}
                      aria-label={label}
                      aria-pressed={isSelected}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {tableTools}

            {isCustomizationEnabled && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowSettingsMenu((v) => !v)}
                  className={cn(
                    'relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass bg-surface text-muted transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-main focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                    showSettingsMenu && 'border-accent/50 bg-accent/5 text-accent',
                  )}
                  title={t('table.settings')}
                  aria-label={t('table.settings')}
                  aria-expanded={showSettingsMenu}
                >
                  <LuSlidersHorizontal className="h-4 w-4" />
                  {hasActivePreferences && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                  )}
                </button>

                {showSettingsMenu && (
                  <div className="absolute right-0 top-full z-60 mt-1.5 w-72 overflow-hidden rounded-lg border border-glass bg-surface shadow-lg shadow-black/10">
                    <div className="flex border-b border-glass bg-bg/30 p-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('columns')}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                          activeTab === 'columns'
                            ? 'bg-surface text-accent shadow-xs'
                            : 'text-muted hover:text-main',
                        )}
                        title={t('table.columns')}
                      >
                        <LuColumns3 className="h-3.5 w-3.5" />
                        <span>{t('table.columns')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('density')}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                          activeTab === 'density'
                            ? 'bg-surface text-accent shadow-xs'
                            : 'text-muted hover:text-main',
                        )}
                        title={t('table.density')}
                      >
                        <LuRows3 className="h-3.5 w-3.5" />
                        <span>{t('table.density')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('export')}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                          activeTab === 'export'
                            ? 'bg-surface text-accent shadow-xs'
                            : 'text-muted hover:text-main',
                        )}
                        title={t('table.export')}
                      >
                        <LuDownload className="h-3.5 w-3.5" />
                        <span>{t('table.export')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('refresh')}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                          activeTab === 'refresh'
                            ? 'bg-surface text-accent shadow-xs'
                            : 'text-muted hover:text-main',
                        )}
                        title={t('table.autoRefresh')}
                      >
                        <LuRefreshCw className="h-3.5 w-3.5" />
                        <span>{t('table.autoRefresh')}</span>
                      </button>
                    </div>

                    {/* Tab Body */}
                    <div className="p-3">
                      {activeTab === 'columns' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-glass pb-1.5">
                            <span className="text-xs font-semibold text-main">
                              {t('table.customizeColumns')}
                            </span>
                            {effectiveHiddenColumns.length > 0 && (
                              <button
                                type="button"
                                onClick={handleResetColumns}
                                className="text-[11px] font-medium text-accent hover:underline"
                              >
                                {t('table.resetColumns')}
                              </button>
                            )}
                          </div>

                          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                            {columns.map((col) => {
                              const isHideable = col.hideable !== false;
                              const isChecked = !effectiveHiddenColumns.includes(col.key);

                              return (
                                <label
                                  key={col.key}
                                  className={cn(
                                    'flex select-none items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors',
                                    isHideable
                                      ? 'cursor-pointer hover:bg-main/5'
                                      : 'cursor-not-allowed opacity-60',
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={!isHideable}
                                      onChange={() => isHideable && toggleColumnVisibility(col.key)}
                                      className="accent-accent"
                                    />
                                    <span className="truncate text-main">{col.header}</span>
                                  </div>

                                  {!isHideable && (
                                    <Badge tone="muted" className="shrink-0 text-[10px]">
                                      {t('table.primary')}
                                    </Badge>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {activeTab === 'density' && (
                        <div className="space-y-2">
                          <span className="mb-1 block text-xs font-semibold text-main">
                            {t('table.density')}
                          </span>
                          {(
                            [
                              { mode: 'compact', label: t('table.densityCompact') },
                              { mode: 'normal', label: t('table.densityNormal') },
                              { mode: 'relaxed', label: t('table.densityRelaxed') },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.mode}
                              type="button"
                              onClick={() => handleDensityChange(item.mode)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-md border border-glass px-2.5 py-1.5 text-xs transition-colors',
                                density === item.mode
                                  ? 'border-accent/40 bg-accent/10 font-semibold text-accent'
                                  : 'bg-surface text-main hover:bg-main/5',
                              )}
                            >
                              <span>{item.label}</span>
                              {density === item.mode && (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {activeTab === 'export' && (
                        <div className="space-y-2">
                          <span className="mb-1 block text-xs font-semibold text-main">
                            {t('table.export')}
                          </span>
                          {(
                            [
                              { format: 'csv', label: t('table.exportCsv') },
                              { format: 'excel', label: t('table.exportExcel') },
                              { format: 'pdf', label: t('table.exportPdf') },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.format}
                              type="button"
                              disabled={!onExport}
                              onClick={() => onExport?.(item.format)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-md border border-glass px-2.5 py-1.5 text-xs transition-colors',
                                onExport
                                  ? 'bg-surface text-main hover:border-accent/40 hover:bg-accent/5'
                                  : 'cursor-not-allowed bg-bg/30 text-muted opacity-70',
                              )}
                            >
                              <span>{item.label}</span>
                              {!onExport && <Badge tone="muted">{t('table.comingSoon')}</Badge>}
                            </button>
                          ))}
                        </div>
                      )}

                      {activeTab === 'refresh' && (
                        <div className="space-y-2">
                          <span className="mb-1 block text-xs font-semibold text-main">
                            {t('table.autoRefresh')}
                          </span>
                          <button
                            type="button"
                            disabled={!onRefresh}
                            onClick={triggerRefreshNow}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md border border-glass px-2.5 py-1.5 text-xs transition-colors',
                              onRefresh
                                ? 'bg-surface text-main hover:border-accent/40 hover:bg-accent/5'
                                : 'cursor-not-allowed bg-bg/30 text-muted opacity-70',
                            )}
                          >
                            <span>{t('table.refreshNow')}</span>
                            <LuRefreshCw className="h-3 w-3" aria-hidden />
                          </button>
                          {(
                            [
                              { interval: 0, label: t('table.refreshOff') },
                              { interval: 30_000, label: '30s' },
                              { interval: 60_000, label: '1m' },
                              { interval: 300_000, label: '5m' },
                            ] as const
                          ).map((item) => (
                            <button
                              key={item.interval}
                              type="button"
                              disabled={!onRefresh}
                              aria-pressed={refreshMs === item.interval}
                              onClick={() => {
                                setRefreshMs(item.interval);
                                if (item.interval > 0) onRefresh?.();
                              }}
                              className={cn(
                                'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                                !onRefresh
                                  ? 'cursor-not-allowed border-glass bg-bg/30 text-muted opacity-70'
                                  : refreshMs === item.interval
                                    ? 'border-accent/40 bg-accent/10 font-semibold text-accent'
                                    : 'border-glass bg-surface text-main hover:border-accent/40 hover:bg-accent/5',
                              )}
                            >
                              <span>{item.label}</span>
                              {refreshMs === item.interval && (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active-query chips row (K-55): removable filter chips + the auto-refresh
          status chip — renders while EITHER is live (filter-less refresh still shows). */}
      {((filters !== undefined && onFiltersChange && filters.length > 0) || refreshMs > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-glass px-4 py-2">
          {filters !== undefined && onFiltersChange && filters.length > 0 && (
            <FilterChips columns={columns} filters={filters} onFiltersChange={onFiltersChange} />
          )}
          {refreshMs > 0 && (
            <RefreshStatusChip intervalMs={refreshMs} remainingMs={remainingMs} onRefreshNow={triggerRefreshNow} />
          )}
        </div>
      )}

      {/* Render Mode 1: Cards Grid */}
      {activeViewMode === 'card' ? (
        <div className="p-4">
          {showSkeleton ? (
            <SkeletonCards rowCount={skeletonRows} />
          ) : showError ? (
            <TableErrorState onRetry={onRetry} icon={errorIcon} />
          ) : data.length === 0 ? (
            <EmptyState message={emptyMessage ?? t('table.noRecords')} icon={emptyIcon} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map((row) => (
                <div
                  key={rowKey(row)}
                  className="rounded-lg border border-glass bg-surface p-4 shadow-sm hover:border-accent/30 transition-all flex flex-col justify-between"
                >
                  {cardRender ? (
                    cardRender(row)
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2 border-b border-glass pb-2.5">
                        <div className="min-w-0 font-semibold text-main text-sm truncate">
                          {visibleColumns[0]?.render
                            ? visibleColumns[0].render(row)
                            : cellText(row, visibleColumns[0])}
                        </div>
                        {actions && <div className="shrink-0">{actions(row)}</div>}
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {visibleColumns.slice(1).map((col) => (
                          <div key={col.key} className="flex items-center justify-between gap-2">
                            <span className="text-muted/70">{col.header}:</span>
                            <span className="text-main font-medium truncate">
                              {col.render
                                ? col.render(row)
                                : cellText(row, col)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeViewMode === 'list' ? (
        /* Render Mode 2: Compact List */
        <div className="p-2">
          {showSkeleton ? (
            <SkeletonList rowCount={skeletonRows} />
          ) : showError ? (
            <TableErrorState onRetry={onRetry} icon={errorIcon} />
          ) : data.length === 0 ? (
            <EmptyState message={emptyMessage ?? t('table.noRecords')} icon={emptyIcon} />
          ) : (
            <div className="divide-y divide-glass/60">
              {data.map((row) => (
                <div
                  key={rowKey(row)}
                  className="p-3 flex items-center justify-between gap-4 hover:bg-accent/[0.03] transition-colors rounded-lg"
                >
                  {listRender ? (
                    listRender(row)
                  ) : (
                    <>
                      <div className="flex flex-1 items-center gap-4 min-w-0 flex-wrap">
                        {visibleColumns.map((col, idx) => (
                          <div
                            key={col.key}
                            className={
                              idx === 0
                                ? 'min-w-[160px] font-semibold text-main text-sm'
                                : 'text-xs text-muted'
                            }
                          >
                            {col.render
                              ? col.render(row)
                              : cellText(row, col)}
                          </div>
                        ))}
                      </div>
                      {actions && <div className="shrink-0">{actions(row)}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Render Mode 3: Classic Table (Default) */
        <div
          ref={
            isVirtualized
              ? (el) => {
                  scrollContainerRef.current = el;
                  if (el) syncVirtualViewport(el);
                }
              : undefined
          }
          onScroll={isVirtualized ? handleVirtualScroll : undefined}
          className={isVirtualized ? 'overflow-auto' : 'overflow-x-auto'}
          style={isVirtualized ? { maxHeight: virtualScrollMax } : undefined}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-glass bg-bg/40">
                {selectionEnabled && (
                  <th className={cn(MICRO_LABEL, 'w-10', thPadding, stickyTh)}>
                    <input
                      type="checkbox"
                      aria-label={t('table.selectAll')}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={toggleAll}
                      className="accent-accent"
                    />
                  </th>
                )}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    aria-sort={ariaSort(col)}
                    className={cn(
                      MICRO_LABEL,
                      'text-left',
                      thPadding,
                      stickyTh,
                      col.className,
                    )}
                  >
                    {headerContent(col)}
                  </th>
                ))}
                {actions && (
                  <th
                    className={cn(
                      MICRO_LABEL,
                      'text-right',
                      thPadding,
                      stickyTh,
                    )}
                  >
                    {actionsHeader}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {showSkeleton ? (
                <SkeletonTableRows colCount={colCount} rowCount={skeletonRows} cell={tdPadding} />
              ) : showError ? (
                <tr>
                  <td colSpan={colCount}>
                    <TableErrorState onRetry={onRetry} icon={errorIcon} />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>
                    <EmptyState message={emptyMessage ?? t('table.noRecords')} icon={emptyIcon} />
                  </td>
                </tr>
              ) : (
                <>
                  {isVirtualized && vWindow.offsetY > 0 && (
                    <tr aria-hidden style={{ height: vWindow.offsetY }} />
                  )}
                  {windowedData.map((row, i) => (
                    <TableRow
                      key={rowKey(row)}
                      row={row}
                      index={windowBaseIndex + i}
                      visibleColumns={visibleColumns}
                      actions={actions}
                      onRowClick={onRowClick}
                      tdPadding={tdPadding}
                      selectionEnabled={selectionEnabled}
                      isSelected={selected.has(rowKey(row))}
                      onToggleRow={toggleRow}
                      virtualRowHeight={isVirtualized ? effectiveRowHeight : undefined}
                    />
                  ))}
                  {isVirtualized && vWindow.bottomOffset > 0 && (
                    <tr aria-hidden style={{ height: vWindow.bottomOffset }} />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectionEnabled && someSelected && (
        <div
          role="toolbar"
          aria-label={t('table.bulkActions')}
          className="flex flex-wrap items-center gap-3 border-t border-glass bg-accent/[0.04] px-4 py-2.5"
        >
          <span className="text-xs font-medium text-accent">
            {t('table.selectedCount', { count: selected.size })}
          </span>
          <div className="flex flex-wrap gap-2">
            {bulkActions!.map((action) => (
              <Button
                key={action.key}
                size="sm"
                variant={action.danger ? 'danger' : 'secondary'}
                onClick={() => runBulkAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted transition-colors hover:text-main hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {t('table.clearSelection')}
          </button>
        </div>
      )}

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalElements={totalElements}
        totalPages={totalPages}
        onPageChange={onPageChange}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={onPageSizeChange}
      />

      {pendingConfirm && (
        <ConfirmDialog
          open
          title={pendingConfirm.action.confirm!.title}
          message={pendingConfirm.action.confirm!.message}
          danger={pendingConfirm.action.danger}
          onConfirm={() => {
            const pendingKeys = new Set(pendingConfirm.rows.map(rowKey));
            const freshRows = data.filter((row) => pendingKeys.has(rowKey(row)));
            if (freshRows.length > 0) {
              void pendingConfirm.action.run(freshRows);
            }
            setPendingConfirm(null);
          }}
          onClose={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}

/** First-load error panel (K-55 step 1): retry re-runs the query; precedence error > empty. */
function TableErrorState({ onRetry, icon: Icon = LuTriangleAlert }: { onRetry?: () => void; icon?: IconType }) {
  const { t } = useT();
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon size={40} strokeWidth={1.5} className="text-danger/60" aria-hidden />
      <div>
        <p className="text-sm font-medium text-main">{t('table.errorTitle')}</p>
        <p className="mt-1 text-xs text-muted">{t('table.errorHint')}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <LuRotateCw className="h-3.5 w-3.5" aria-hidden />
          {t('table.retry')}
        </Button>
      )}
    </div>
  );
}

/** (K-55 F6) Auto-render helper: extracts the string value for a column without `render`.
 *  In dev mode, warns once per column key when the key is absent from the row. */
const _warnedCellKeys = new Set<string>();
function cellText<T>(row: T, col: Column<T> | undefined): string {
  if (!col) return '';
  const value = (row as Record<string, unknown>)[col.key];
  if (import.meta.env.DEV && !col.render && !(col.key in (row as Record<string, unknown>))) {
    if (!_warnedCellKeys.has(col.key)) {
      _warnedCellKeys.add(col.key);
      console.warn(
        `[DataTable] Column key "${col.key}" is not a field on the row object. ` +
          `Composite/virtual columns must provide a render function.`,
      );
    }
  }
  return String(value ?? '');
}

/** (K-55 F7) Memoized classic-table row — prevents full-table re-renders on auto-refresh
 *  countdown ticks and individual selection toggles. Props use stable primitives so the
 *  memo comparison is cheap. */
const TableRow = React.memo(function TableRow<T>({
  row,
  index,
  visibleColumns,
  actions,
  onRowClick,
  tdPadding,
  selectionEnabled,
  isSelected,
  onToggleRow,
  virtualRowHeight,
}: {
  row: T;
  index: number;
  visibleColumns: Column<T>[];
  actions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  tdPadding: string;
  selectionEnabled: boolean;
  isSelected: boolean;
  onToggleRow: (row: T, index: number, shiftKey: boolean) => void;
  virtualRowHeight?: number;
}) {
  const { t } = useT();
  return (
    <tr
      style={virtualRowHeight ? { height: virtualRowHeight } : undefined}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(row);
              }
            }
          : undefined
      }
      tabIndex={onRowClick ? 0 : undefined}
      className={cn(
        'border-b border-glass/60 transition-colors last:border-0 focus:outline-none focus-visible:bg-accent/[0.06]',
        onRowClick ? 'cursor-pointer hover:bg-accent/[0.06]' : 'hover:bg-accent/[0.04]',
      )}
    >
      {selectionEnabled && (
        <td className={tdPadding} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={t('table.selectRow')}
            checked={isSelected}
            onClick={(e) => onToggleRow(row, index, e.shiftKey)}
            onChange={() => undefined}
            className="accent-accent"
          />
        </td>
      )}
      {visibleColumns.map((col) => (
        <td key={col.key} className={cn('text-main', tdPadding, col.className)}>
          {col.render ? col.render(row) : cellText(row, col)}
        </td>
      ))}
      {actions && (
        <td className={cn('text-right', tdPadding)} onClick={(e) => e.stopPropagation()}>
          {actions(row)}
        </td>
      )}
    </tr>
  );
}) as <T>(props: {
  row: T;
  index: number;
  visibleColumns: Column<T>[];
  actions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  tdPadding: string;
  selectionEnabled: boolean;
  isSelected: boolean;
  onToggleRow: (row: T, index: number, shiftKey: boolean) => void;
  virtualRowHeight?: number;
}) => React.ReactElement;



/** Skeleton first-load states (K-55 step 1) — deterministic widths, never Math.random. */

function SkeletonTableRows({ colCount, rowCount, cell }: { colCount: number; rowCount: number; cell: string }) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, r) => (
        <tr key={r} className="border-b border-glass/60 last:border-0">
          {Array.from({ length: colCount }).map((_, c) => (
            <td key={c} className={cell}>
              <div className="h-4 animate-pulse rounded bg-main/10" style={{ width: `${56 + ((r * 7 + c * 13) % 40)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SkeletonCards({ rowCount }: { rowCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="rounded-lg border border-glass bg-surface p-4 shadow-sm">
          <div className="h-4 w-1/2 animate-pulse rounded bg-main/10" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-main/5" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-main/5" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-main/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ rowCount }: { rowCount: number }) {
  return (
    <div className="divide-y divide-glass/60">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <div className="h-4 w-40 animate-pulse rounded bg-main/10" />
          <div className="h-3 flex-1 animate-pulse rounded bg-main/5" />
        </div>
      ))}
    </div>
  );
}


