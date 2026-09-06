import { api } from '../../lib/api';
import type { SaveSavedViewRequest, SavedViewDto } from './types';

export const savedViewsApi = {
  /** The current user's views for one table (design-bounded list — no paging). */
  list: (storageKey: string) =>
    api.get<SavedViewDto[]>(`/api/v1/saved-views?storageKey=${encodeURIComponent(storageKey)}`),
  /** Same name (case-insensitive) per user+table replaces the stored state — v1 semantics. */
  save: (data: SaveSavedViewRequest) => api.post<SavedViewDto>('/api/v1/saved-views', data),
  remove: (id: string) => api.delete<void>(`/api/v1/saved-views/${id}`),
};
