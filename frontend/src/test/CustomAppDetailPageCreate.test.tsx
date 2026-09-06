import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomAppDetailPage } from '../features/custom-apps/CustomAppDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import type { CustomAppDetail } from '../features/custom-apps/types';

const APP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const APP: CustomAppDetail = {
  id: APP_ID,
  projectId: 'proj-1',
  projectName: 'Genel',
  name: 'CRM',
  description: null,
  icon: '📊',
  createdDate: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  properties: [],
  views: [],
};

const EMPTY_PAGE = { data: [], meta: { page: 0, pageSize: 100, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };

let calls: { method: string; url: string; body?: string }[] = [];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? String(init.body) : undefined });
      const body = url === `/api/v1/custom-apps/${APP_ID}` ? APP : EMPTY_PAGE;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/apps/new" element={<CustomAppDetailPage />} />
          <Route path="/apps/:customAppId" element={<CustomAppDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomAppDetailPage (create + inline edit, icon picker)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the selected emoji on create and omits it when none', async () => {
    const user = userEvent.setup();
    renderAt('/apps/new');

    expect(await screen.findByRole('heading', { name: 'New app' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Inventory');
    await user.click(screen.getByRole('button', { name: '🛒' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/custom-apps');
      expect(post).toBeDefined();
      expect(JSON.parse(post!.body!)).toEqual({ name: 'Inventory', icon: '🛒' });
    });
  });

  it('creates without an icon when none is picked', async () => {
    const user = userEvent.setup();
    renderAt('/apps/new');

    await user.type(await screen.findByLabelText('Name'), 'Inventory');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/custom-apps');
      expect(JSON.parse(post!.body!)).toEqual({ name: 'Inventory' });
    });
  });

  it('preselects the stored icon on edit and sends an explicit null when cleared', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}`);

    // View mode shows the icon-prefixed heading; edit seeds the stored icon.
    expect(await screen.findByRole('heading', { name: /📊 CRM/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const noneBtn = await screen.findByRole('button', { name: 'None' });
    expect(noneBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '📊' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(noneBtn);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === `/api/v1/custom-apps/${APP_ID}`);
      expect(put).toBeDefined();
      // The backend overwrites icon unconditionally — an emptied picker sends null.
      expect(JSON.parse(put!.body!)).toEqual({ name: 'CRM', icon: null });
    });
  });
});
