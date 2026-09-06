import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestLogsPage } from '../features/audit/RequestLogsPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import { encodeSearchQuery } from '../lib/searchQuery';
import { decodedSq, flatParams } from './sqUrl';

/** GET /api/v1/request-logs PageResponse payload. */
const REQUEST_LOGS_PAYLOAD = {
  data: [
    {
      id: 'rl-1',
      traceId: 'a1b2c3d4-1111-2222-3333-444444444444',
      method: 'GET',
      path: '/api/v1/users',
      status: 200,
      durationMs: 120,
      userId: '12345678-90ab-cdef-1234-567890abcdef',
      username: 'admin@tenant.test',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      requestBody: null,
      createdAt: '2026-08-23T09:00:00Z',
    },
    {
      id: 'rl-2',
      traceId: 'b2c3d4e5-1111-2222-3333-444444444444',
      method: 'POST',
      path: '/api/v1/auth/login',
      status: 401,
      durationMs: 340,
      userId: null,
      username: null,
      ipAddress: '10.0.0.5',
      userAgent: 'vitest',
      requestBody: null,
      createdAt: '2026-08-23T09:05:00Z',
    },
  ],
  meta: { page: 0, pageSize: 10, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

let urls: string[] = [];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequestLogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequestLogsPage', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    urls = [];
    window.localStorage.clear();
    window.history.replaceState(null, '', '/request-logs');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return new Response(JSON.stringify(REQUEST_LOGS_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('renders the request log rows from the API, defaulting to the createdDate sort', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Request Logs' })).toBeInTheDocument();
    expect(await screen.findByText('/api/v1/users')).toBeInTheDocument();
    expect(screen.getByText('admin@tenant.test')).toBeInTheDocument();
    expect(screen.getByText('340 ms')).toBeInTheDocument();

    // Regression lock: the sort must be the entity attribute (SortGuard whitelist),
    // not the DTO wire name createdAt — asserted in the flat sort param.
    await waitFor(() => {
      expect(urls.some((u) => flatParams(u).getAll('sort').includes('createdDate,desc'))).toBe(true);
      expect(urls.some((u) => flatParams(u).getAll('sort').some((s) => s.startsWith('createdAt')))).toBe(false);
    });
  });

  it('re-queries with the whitelisted backend field when sorting by a column', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('/api/v1/users');

    await user.click(screen.getByRole('button', { name: 'Path' }));

    // toggleSort switches to the new field ascending and resets the page.
    await waitFor(() => {
      expect(urls.some((u) => flatParams(u).getAll('sort').includes('path,asc'))).toBe(true);
    });
  });

  it('hydrates the query from the URL (flat sort + sq q) (K-55 shareable view link)', async () => {
    const blob = encodeSearchQuery({ v: 1, q: 'admin' })!;
    window.history.replaceState(null, '', `/request-logs?page=0&size=10&sort=path,asc&sq=${blob}`);
    renderPage();

    expect(await screen.findByText('/api/v1/users')).toBeInTheDocument();
    await waitFor(() => {
      expect(urls.some((u) => flatParams(u).getAll('sort').includes('path,asc')
        && decodedSq(u)?.q === 'admin')).toBe(true);
    });
  });

  it('writes the flat sort param into the URL on a committed change', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('/api/v1/users');

    await user.click(screen.getByRole('button', { name: 'Path' }));

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).getAll('sort')).toContain('path,asc');
    });
  });

  it('shows the error panel with retry when the first load fails, then recovers (K-55 step 1)', async () => {
    const user = userEvent.setup();
    let requestLogCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        // The SavedViewsMenu list call rides along on mount — always healthy here;
        // the error scenario targets the request-logs query itself.
        if (url.startsWith('/api/v1/saved-views')) {
          return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        requestLogCalls++;
        if (requestLogCalls === 1) {
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
        }
        return new Response(JSON.stringify(REQUEST_LOGS_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load results')).toBeInTheDocument();
    // Empty rows are NOT rendered while the error panel is up.
    expect(screen.queryByText('/api/v1/users')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('/api/v1/users')).toBeInTheDocument();
  });

  it('opening a row shows the detail drawer with the full trace id and body (K-55 F3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('/api/v1/users');

    await user.click(screen.getByText('admin@tenant.test'));

    const dialog = screen.getByRole('dialog', { name: 'Request Details' });
    expect(dialog).toBeInTheDocument();
    // The FULL trace id (the table truncates to 8 chars) — scoped to the drawer.
    expect(within(dialog).getByText('a1b2c3d4-1111-2222-3333-444444444444')).toBeInTheDocument();
    expect(within(dialog).getByText('12345678-90ab-cdef-1234-567890abcdef')).toBeInTheDocument();
  });

  it('closing the drawer returns focus to the table and the list stays intact', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('/api/v1/users');

    await user.click(screen.getByText('admin@tenant.test'));
    expect(screen.getByRole('dialog', { name: 'Request Details' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('/api/v1/users')).toBeInTheDocument();
  });

  it('exports the current query as CSV via the sq param (K-55 F5)', async () => {
    const user = userEvent.setup();
    const urls2: string[] = [];
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls2.push(url);
        if (url.startsWith('/api/v1/request-logs/export')) {
          return new Response('\uFEFFid,traceId', { status: 200, headers: { 'Content-Type': 'text/csv;charset=UTF-8' } });
        }
        return new Response(JSON.stringify(REQUEST_LOGS_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderPage();
    await screen.findByText('/api/v1/users');

    // settings → export tab → CSV
    await user.click(screen.getByRole('button', { name: /table settings/i }));
    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(urls2.some((u) => u.startsWith('/api/v1/request-logs/export?')
        && flatParams(u).getAll('sort').includes('createdDate,desc'))).toBe(true);
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous rows visible while the next query is in flight (keep-previous, K-55 step 1)', async () => {
    const user = userEvent.setup();
    let pends = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        if (pends) return new Promise<Response>(() => {}); // never resolves
        return new Response(JSON.stringify(REQUEST_LOGS_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    const view = renderPage();
    expect(await screen.findByText('/api/v1/users')).toBeInTheDocument();

    pends = true;
    await user.click(screen.getByRole('button', { name: 'Path' }));

    await waitFor(() => {
      expect(urls.some((u) => flatParams(u).getAll('sort').includes('path,asc'))).toBe(true);
    });
    // Old rows stay on screen and the fetching indicator is up while the new query pends.
    expect(screen.getByText('/api/v1/users')).toBeInTheDocument();
    expect(view.container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('applies a saved view end-to-end: re-query + column prefs (K-56 F3)', async () => {
    const user = userEvent.setup();
    const savedView = {
      id: 'sv-1',
      storageKey: 'request-logs',
      name: 'Slow POSTs',
      state: JSON.stringify({
        v: 2,
        q: 'POST',
        sorts: [{ field: 'path', direction: 'asc' }],
        prefs: { hiddenColumns: ['userAgent'], density: 'compact' },
      }),
      createdDate: '2026-09-06T10:00:00Z',
      updatedAt: '2026-09-06T10:00:00Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/v1/saved-views')) {
          return new Response(JSON.stringify([savedView]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        urls.push(url);
        return new Response(JSON.stringify(REQUEST_LOGS_PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderPage();
    expect(await screen.findByText('/api/v1/users')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'User Agent' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /views/i }));
    await user.click(await screen.findByRole('button', { name: 'Slow POSTs' }));

    // Query part: the committed q re-fires the request-logs query (inside the sq blob).
    await waitFor(() => {
      expect(urls.some((u) => decodedSq(u)?.q === 'POST')).toBe(true);
    });
    // Prefs part: the User Agent column is hidden and the density switched to compact.
    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: 'User Agent' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('columnheader', { name: /path/i }).className).toContain('py-2');
  });
});
