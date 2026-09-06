import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionDetailPage } from '../features/permissions/PermissionDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const PERMISSION = {
  id: 'p-1',
  name: 'custom:report:read',
  description: 'Read custom reports',
};

const CREATED = { id: 'p-9', name: 'custom:report:write', description: null };

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 200, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string; body?: unknown }[];

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = EMPTY_PAGE;
      if (url === '/api/v1/permissions/p-1') body = PERMISSION;
      else if (url === '/api/v1/permissions/p-9') body = CREATED;
      else if (url === '/api/v1/permissions' && method === 'POST') body = CREATED;
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
          <Route path="/permissions/new" element={<PermissionDetailPage />} />
          <Route path="/permissions/:permissionId" element={<PermissionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PermissionDetailPage (create + inline edit)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stub();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates at /permissions/new: POSTs, then lands on the created permission page', async () => {
    const user = userEvent.setup();
    renderAt('/permissions/new');

    await user.type(await screen.findByPlaceholderText('e.g. custom:report:read'), 'custom:report:write');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/permissions');
      expect(post?.body).toEqual({ name: 'custom:report:write' });
    });
    expect(await screen.findByRole('heading', { name: 'custom:report:write' })).toBeInTheDocument();
  });

  it('edits in-page: seeds the draft, PUTs the change and exits edit mode', async () => {
    const user = userEvent.setup();
    renderAt('/permissions/p-1');

    expect(await screen.findByRole('heading', { name: 'custom:report:read' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = await screen.findByDisplayValue('custom:report:read');
    await user.clear(input);
    await user.type(input, 'custom:report:export');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/permissions/p-1');
      expect(put?.body).toEqual({ name: 'custom:report:export', description: 'Read custom reports' });
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
  });

  it('keeps the definition list read-only for a viewer without iam:permission:write', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'iam:permission:write' });
    renderAt('/permissions/p-1');

    expect(await screen.findByText('Read custom reports')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
