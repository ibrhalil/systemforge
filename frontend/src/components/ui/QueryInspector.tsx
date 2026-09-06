import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryCache } from '@tanstack/react-query';
import { LuActivity, LuX } from 'react-icons/lu';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/format';
import { INPUT_BASE_SM, META_MONO, POPOVER_PANEL } from './styles';

type CacheQuery = ReturnType<QueryCache['getAll']>[number];

const KEY_LIMIT = 72;

function formatKey(key: readonly unknown[]): string {
  const raw = JSON.stringify(key);
  return raw.length > KEY_LIMIT ? `${raw.slice(0, KEY_LIMIT)}…` : raw;
}

function lastUpdatedAt(q: CacheQuery): number {
  return Math.max(q.state.dataUpdatedAt, q.state.errorUpdatedAt);
}

function statusLabel(q: CacheQuery): string {
  if (q.state.fetchStatus === 'fetching') return 'fetching';
  if (q.state.fetchStatus === 'paused') return 'paused';
  return q.state.status;
}

function statusClass(q: CacheQuery): string {
  if (q.state.fetchStatus === 'fetching') return 'animate-pulse text-accent';
  if (q.state.fetchStatus === 'paused') return 'text-muted';
  if (q.state.status === 'error') return 'text-danger';
  if (q.state.status === 'pending') return 'text-muted';
  return 'text-accent-green';
}

/**
 * DEV-only (K-56 F1): read-only TanStack Query cache inspector — floating panel listing
 * live queries (key, status, fetch/observer counts). Mount only behind import.meta.env.DEV.
 */
export function QueryInspector() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [queries, setQueries] = useState<CacheQuery[]>(() => queryClient.getQueryCache().getAll());

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    setQueries(cache.getAll());
    return cache.subscribe(() => setQueries(cache.getAll()));
  }, [queryClient]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? queries.filter((q) => JSON.stringify(q.queryKey).toLowerCase().includes(needle))
      : [...queries];
    return matched.sort((a, b) => lastUpdatedAt(b) - lastUpdatedAt(a));
  }, [queries, filter]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label="Query inspector"
        title="Query inspector"
        className="fixed bottom-4 right-4 z-60 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-glass bg-surface text-muted shadow-lg shadow-black/10 transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <LuActivity className="h-4 w-4" aria-hidden />
        {queries.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded bg-accent px-1 text-[10px] font-semibold leading-4 text-surface">
            {queries.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      aria-label="Query inspector"
      className={cn('fixed bottom-4 right-4 z-60 flex w-96 flex-col text-left', POPOVER_PANEL)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-glass px-3 py-2">
        <span className="text-xs font-semibold text-main">Query Inspector</span>
        <span className={META_MONO}>
          {visible.length}/{queries.length}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close query inspector"
          className="rounded-md p-1 text-muted/50 transition-colors hover:bg-accent/5 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <LuX className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="border-b border-glass p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter keys…"
          aria-label="Filter query keys"
          className={INPUT_BASE_SM}
        />
      </div>

      <div className="max-h-96 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">No matching queries</p>
        ) : (
          visible.map((q) => (
            <div key={q.queryHash} className="border-b border-glass px-3 py-2 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(META_MONO, 'truncate text-main')} title={JSON.stringify(q.queryKey)}>
                  {formatKey(q.queryKey)}
                </span>
                <span className={cn('shrink-0 text-[11px] font-semibold', statusClass(q))}>
                  {statusLabel(q)}
                </span>
              </div>
              <div className={cn(META_MONO, 'mt-0.5 flex gap-3 text-[11px]')}>
                <span>{q.getObserversCount()} obs</span>
                <span>{q.state.dataUpdateCount} fetches</span>
                <span>
                  {q.state.isInvalidated
                    ? 'stale'
                    : q.state.dataUpdatedAt
                      ? relativeTime(new Date(q.state.dataUpdatedAt).toISOString())
                      : '—'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
