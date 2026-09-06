import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedViewsApi } from './api';
import type { SaveSavedViewRequest } from './types';

/** The current user's saved views for one table (K-56 F3, DB-backed). */
export function useSavedViews(storageKey: string, enabled = true) {
  return useQuery({
    queryKey: ['saved-views', storageKey],
    queryFn: () => savedViewsApi.list(storageKey),
    enabled,
  });
}

export function useSaveSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveSavedViewRequest) => savedViewsApi.save(data),
    onSuccess: (_saved, variables) => qc.invalidateQueries({ queryKey: ['saved-views', variables.storageKey] }),
  });
}

export function useDeleteSavedView(storageKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedViewsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views', storageKey] }),
  });
}
