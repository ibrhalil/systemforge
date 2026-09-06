import type { ListQuerySnapshot } from '../types';

/**
 * Legacy localStorage named views (K-55 F7, v1). Since K-56 F3 the source of truth
 * is the DB (`features/saved-views` + `t_saved_views`); this module is only the
 * MIGRATION SOURCE — the SavedViewsMenu silently uploads v1 rows to the DB on
 * first load and then removes the localStorage key.
 */

export interface SavedView {
  id: string;
  name: string;
  state: ListQuerySnapshot;
  createdAt: string;
}

const PREFIX = 'sf_table_views_';

export function legacySavedViewsStorageKey(key: string): string {
  return `${PREFIX}${key}`;
}

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string'
    && typeof v.state === 'object' && v.state !== null
    && (v.state as Record<string, unknown>).v === 1;
}

/** Reads the v1 rows still awaiting DB migration (empty when already migrated). */
export function listSavedViews(key: string): SavedView[] {
  try {
    const raw = localStorage.getItem(legacySavedViewsStorageKey(key));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

/** Called after a successful silent migration — v1 data is now DB-backed. */
export function clearLegacySavedViews(key: string): void {
  try {
    localStorage.removeItem(legacySavedViewsStorageKey(key));
  } catch {
    // ignore storage failures — a leftover key only makes the migration re-check
  }
}
