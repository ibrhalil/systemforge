import { useEffect, useRef, useState } from 'react';
import { LuBookmark, LuTrash2 } from 'react-icons/lu';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';
import { listSavedViews, clearLegacySavedViews } from '../../lib/savedViews';
import { loadTablePreferences } from '../../lib/tablePreferences';
import { PERMISSIONS } from '../../lib/permissions';
import { useAuthStore } from '../../store/authStore';
import { savedViewsApi } from '../../features/saved-views/api';
import { useDeleteSavedView, useSavedViews, useSaveSavedView } from '../../features/saved-views/hooks';
import type { SavedViewDto } from '../../features/saved-views/types';
import type { ListQuerySnapshot, SavedViewPrefs } from '../../types';

interface SavedViewsMenuProps {
  /** localStorage scope — the table's storageKey. */
  storageKey: string;
  /** The current committed query state (persisted when saving). */
  state: ListQuerySnapshot;
  /** Applies a saved view — the page feeds it to `useListPageState.applySearchQuery`. */
  onApply: (state: ListQuerySnapshot) => void;
  /** Applies the view's column prefs — the page wires it to DataTable's `appliedPrefs`. */
  onApplyPrefs?: (prefs: SavedViewPrefs) => void;
}

/** Snapshot v2 prefs: the table prefs that exist as features (hidden columns + density). */
function snapshotPrefs(storageKey: string): SavedViewPrefs {
  const prefs = loadTablePreferences(storageKey);
  return {
    ...(prefs.hiddenColumns?.length ? { hiddenColumns: prefs.hiddenColumns } : {}),
    ...(prefs.density && prefs.density !== 'normal' ? { density: prefs.density } : {}),
  };
}

/**
 * Named-views dropdown for list pages (K-56 F3, DB-backed v2): save the current
 * query + column prefs under a name, re-apply in one click, delete stale ones.
 * v1 localStorage rows migrate silently to the DB on first load (write-permitting),
 * then the legacy key is removed. Renders nothing without `iam:saved-view:read`.
 */
export function SavedViewsMenu({ storageKey, state, onApply, onApplyPrefs }: SavedViewsMenuProps) {
  const { t } = useT();
  const hasAuthority = useAuthStore((s) => s.hasAuthority);
  const canRead = hasAuthority(PERMISSIONS.SAVED_VIEW_READ);
  const canWrite = hasAuthority(PERMISSIONS.SAVED_VIEW_WRITE);

  const { data: views, isSuccess } = useSavedViews(storageKey, canRead);
  const saveMutation = useSaveSavedView();
  const deleteMutation = useDeleteSavedView(storageKey);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const migrationAttempted = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Silent v1 → DB migration (K-56 F3): only when the DB list is empty and v1 rows
  // still exist. Uses the raw api (not a mutation) so failures stay silent — no
  // global mutation-error toast; the legacy key survives for the next attempt.
  useEffect(() => {
    if (!canWrite || !isSuccess || migrationAttempted.current) return;
    const legacy = listSavedViews(storageKey);
    if ((views ?? []).length > 0 || legacy.length === 0) return;
    migrationAttempted.current = true;
    void (async () => {
      try {
        for (const view of legacy) {
          await savedViewsApi.save({ storageKey, name: view.name, state: JSON.stringify(view.state) });
        }
        clearLegacySavedViews(storageKey);
        await queryClient.invalidateQueries({ queryKey: ['saved-views', storageKey] });
      } catch {
        // silent by design
      }
    })();
  }, [canWrite, isSuccess, views, storageKey, queryClient]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const snapshot: ListQuerySnapshot = { ...state, v: 2, prefs: snapshotPrefs(storageKey) };
    saveMutation.mutate(
      { storageKey, name: trimmed, state: JSON.stringify(snapshot) },
      { onSuccess: () => setName('') },
    );
  };

  const apply = (view: SavedViewDto) => {
    let snapshot: ListQuerySnapshot | null = null;
    try {
      const parsed: unknown = JSON.parse(view.state);
      if (parsed && typeof parsed === 'object') snapshot = parsed as ListQuerySnapshot;
    } catch {
      // corrupt payload — ignore the click
    }
    if (!snapshot) return;
    const { prefs, ...query } = snapshot;
    onApply({ ...query, v: snapshot.v });
    if (prefs) onApplyPrefs?.(prefs);
    setOpen(false);
  };

  if (!canRead) return null;

  const list = views ?? [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg border border-glass bg-surface px-2.5 text-xs text-muted transition-colors',
          'hover:border-accent/40 hover:bg-accent/5 hover:text-main focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          open && 'border-accent/50 bg-accent/5 text-accent',
        )}
        title={t('savedViews.title')}
      >
        <LuBookmark className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{t('savedViews.title')}</span>
        {list.length > 0 && (
          <span className="rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent">{list.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-60 mt-1.5 w-64 overflow-hidden rounded-lg border border-glass bg-surface shadow-lg shadow-black/10">
          {canWrite && (
            <div className="flex gap-1.5 border-b border-glass bg-bg/30 p-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder={t('savedViews.namePh')}
                aria-label={t('savedViews.namePh')}
                className="h-7 w-full min-w-0 rounded-md border border-glass bg-surface px-2 text-xs text-main focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <button
                type="button"
                onClick={save}
                disabled={!name.trim() || saveMutation.isPending}
                className="shrink-0 rounded-md bg-accent px-2.5 text-xs font-semibold text-surface transition-colors hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
              >
                {t('savedViews.save')}
              </button>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto p-1">
            {isSuccess && list.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted">{t('savedViews.empty')}</p>
            ) : (
              list.map((view) => (
                <div key={view.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => apply(view)}
                    className="flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs text-main transition-colors hover:bg-accent/5 hover:text-accent focus:outline-none focus-visible:bg-accent/10"
                    title={view.name}
                  >
                    {view.name}
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(view.id)}
                      aria-label={`${t('common.delete')}: ${view.name}`}
                      className="rounded-md p-1 text-muted/50 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 group-hover:opacity-100"
                    >
                      <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
