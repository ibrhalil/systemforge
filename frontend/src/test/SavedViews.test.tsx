import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SavedViewsMenu } from '../components/ui/SavedViewsMenu';
import { clearLegacySavedViews, listSavedViews } from '../lib/savedViews';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import type { ListQuerySnapshot } from '../types';

/**
 * Saved views (K-56 F3, DB-backed v2): v1 localStorage lib as migration source,
 * menu wiring over the REST feature (list/save/apply/delete), the prefs channel
 * and the silent v1→DB migration.
 */

const STATE: ListQuerySnapshot = {
  v: 1,
  page: 0,
  size: 10,
  sorts: [{ field: 'createdDate', direction: 'desc' }],
  q: 'errors',
};

const DB_VIEW = {
  id: 'sv-1',
  storageKey: 'menu-t',
  name: 'Errors only',
  state: JSON.stringify({ ...STATE, v: 2, prefs: { hiddenColumns: ['userAgent'], density: 'compact' } }),
  createdDate: '2026-09-06T10:00:00Z',
  updatedAt: '2026-09-06T10:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderMenu(props: Partial<Parameters<typeof SavedViewsMenu>[0]> = {}) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SavedViewsMenu storageKey="menu-t" state={STATE} onApply={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

function grantSavedViewAuthorities() {
  useAuthStore.setState({
    hasAuthority: (a) => a === 'iam:saved-view:read' || a === 'iam:saved-view:write',
  });
}

describe('savedViews legacy store (migration source)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('reads seeded v1 rows and tolerates corrupt storage', () => {
    const row = { id: 'x', name: 'Old', state: { v: 1 }, createdAt: '2026-01-01T00:00:00Z' };
    window.localStorage.setItem('sf_table_views_t', JSON.stringify([row]));
    expect(listSavedViews('t')).toHaveLength(1);
    expect(listSavedViews('t')[0].name).toBe('Old');

    window.localStorage.setItem('sf_table_views_t', '{not json');
    expect(listSavedViews('t')).toEqual([]);
  });

  it('clearLegacySavedViews removes the key', () => {
    window.localStorage.setItem('sf_table_views_t', '[]');
    clearLegacySavedViews('t');
    expect(window.localStorage.getItem('sf_table_views_t')).toBeNull();
  });
});

describe('SavedViewsMenu (DB v2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: 'en' });
    grantSavedViewAuthorities();
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    useAuthStore.setState({ hasAuthority: () => false });
  });

  it('renders nothing without iam:saved-view:read', () => {
    useAuthStore.setState({ hasAuthority: () => false });
    const { container } = renderMenu();

    expect(container.querySelector('button')).toBeNull();
  });

  it('lists the DB views', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => jsonResponse([DB_VIEW])));

    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /views/i }));

    expect(await screen.findByText('Errors only')).toBeInTheDocument();
  });

  it('saves a v2 snapshot carrying the current column prefs', async () => {
    window.localStorage.setItem(
      'sf_table_prefs_menu-t',
      JSON.stringify({ hiddenColumns: ['userAgent'], density: 'compact', pageSize: 25 }),
    );
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'My View' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url]) => String(url) === '/api/v1/saved-views');
      expect(post).toBeDefined();
    });
    const post = fetchMock.mock.calls.find(([url]) => String(url) === '/api/v1/saved-views');
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body.storageKey).toBe('menu-t');
    expect(body.name).toBe('My View');
    const snapshot = JSON.parse(body.state);
    expect(snapshot.v).toBe(2);
    expect(snapshot.q).toBe('errors');
    expect(snapshot.prefs).toEqual({ hiddenColumns: ['userAgent'], density: 'compact' });
  });

  it('applies the query part and routes prefs separately', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL) => jsonResponse([DB_VIEW])));
    const onApply = vi.fn();
    const onApplyPrefs = vi.fn();

    renderMenu({ onApply, onApplyPrefs });
    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    fireEvent.click(await screen.findByText('Errors only'));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ q: 'errors', v: 2 }));
    expect(onApply.mock.calls[0][0].prefs).toBeUndefined();
    expect(onApplyPrefs).toHaveBeenCalledWith({ hiddenColumns: ['userAgent'], density: 'compact' });
  });

  it('deletes a view through the API', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse([DB_VIEW]));
    vi.stubGlobal('fetch', fetchMock);

    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    fireEvent.click(await screen.findByRole('button', { name: /delete: errors only/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/v1/saved-views/sv-1')).toBe(true);
    });
  });

  it('silently migrates v1 localStorage rows to the DB and clears the key', async () => {
    const legacy = { id: 'l1', name: 'Old view', state: STATE, createdAt: '2026-01-01T00:00:00Z' };
    window.localStorage.setItem('sf_table_views_menu-t', JSON.stringify([legacy]));
    let migrated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/saved-views') {
        migrated = true;
        return jsonResponse({ ...DB_VIEW, name: 'Old view' }, 201);
      }
      return jsonResponse(migrated ? [{ ...DB_VIEW, name: 'Old view' }] : []);
    });
    vi.stubGlobal('fetch', fetchMock);
    const fetchSpy = fetchMock;

    renderMenu();

    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(([url]) => String(url) === '/api/v1/saved-views');
      expect(post).toBeDefined();
    });
    const post = fetchSpy.mock.calls.find(([url]) => String(url) === '/api/v1/saved-views');
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body.name).toBe('Old view');
    expect(JSON.parse(body.state)).toEqual(STATE); // migrated verbatim, prefs-less (partial by decision)

    await waitFor(() => expect(window.localStorage.getItem('sf_table_views_menu-t')).toBeNull());
    // the invalidated refetch now serves the migrated row
    fireEvent.click(screen.getByRole('button', { name: /views/i }));
    expect(await screen.findByText('Old view')).toBeInTheDocument();
  });
});
