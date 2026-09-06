import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useDeleteSavedView, useSavedViews, useSaveSavedView } from '../features/saved-views/hooks';
import type { SavedViewDto } from '../features/saved-views/types';

/**
 * saved-views feature wiring (K-56 F3): query/mutation calls hit the /api/v1/saved-views
 * contract and mutations invalidate the scoped ['saved-views', storageKey] key.
 */

const dto: SavedViewDto = {
  id: 'sv-1',
  storageKey: 'request-logs',
  name: 'Errors only',
  state: '{"v":2,"filters":[]}',
  createdDate: '2026-09-06T10:00:00Z',
  updatedAt: '2026-09-06T10:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('saved-views feature (K-56 F3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('useSavedViews fetches the scoped list', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse([dto]));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();

    const { result } = renderHook(() => useSavedViews('request-logs'), { wrapper: wrap(client) });

    await waitFor(() => expect(result.current.data).toEqual([dto]));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/saved-views?storageKey=request-logs');
  });

  it('useSaveSavedView posts the view and invalidates the scoped key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('storageKey=') ? jsonResponse([dto]) : jsonResponse(dto, 201));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    await client.prefetchQuery({
      queryKey: ['saved-views', 'request-logs'],
      queryFn: () => Promise.resolve([dto]),
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSaveSavedView(), { wrapper: wrap(client) });
    result.current.mutate({ storageKey: 'request-logs', name: 'Errors only', state: '{"v":2}' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const post = fetchMock.mock.calls.find(([url]) => String(url) === '/api/v1/saved-views') as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      storageKey: 'request-logs',
      name: 'Errors only',
      state: '{"v":2}',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['saved-views', 'request-logs'] });
  });

  it('useDeleteSavedView deletes by id and invalidates the scoped key', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse([dto]));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteSavedView('request-logs'), { wrapper: wrap(client) });
    result.current.mutate('sv-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/saved-views/sv-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['saved-views', 'request-logs'] });
  });
});
