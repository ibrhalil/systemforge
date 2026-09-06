import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleDetailPage } from '../features/roles/RoleDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const ROLE = {
  id: 'r-1',
  name: 'Developer',
  description: 'Ships features',
  allPermissions: false,
  permissions: [{ id: 'p-1', name: 'iam:user:read' }],
  parents: [],
};

const PERMISSIONS_PAGE = {
  data: [{ id: 'p-1', name: 'iam:user:read', description: null }],
  meta: { page: 0, pageSize: 200, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string; body?: unknown }[];

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = url === '/api/v1/roles/r-1'
        ? ROLE
        : url === '/api/v1/roles/r-9'
          ? { id: 'r-9', name: 'SRE', description: null, allPermissions: false, permissions: [], parents: [] }
          : url === '/api/v1/roles'
            ? { id: 'r-9', name: 'SRE', description: null, allPermissions: false, permissions: [], parents: [] }
            : url.startsWith('/api/v1/permissions')
              ? PERMISSIONS_PAGE
              : { data: [], meta: { page: 0, pageSize: 20, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };
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
          <Route path="/roles/new" element={<RoleDetailPage />} />
          <Route path="/roles/:roleId" element={<RoleDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RoleDetailPage (create + inline edit)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stub();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates at /roles/new: POSTs, then lands on the created role page', async () => {
    const user = userEvent.setup();
    renderAt('/roles/new');

    await user.type(await screen.findByPlaceholderText('e.g. Editor'), 'SRE');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/roles');
      expect(post?.body).toEqual({ name: 'SRE' });
    });
    // Navigation to the created role: detail query runs and the heading flips.
    expect(await screen.findByRole('heading', { name: 'SRE' })).toBeInTheDocument();
  });

  it('edits in-page: seeds the draft, PUTs the diff and exits edit mode', async () => {
    const user = userEvent.setup();
    renderAt('/roles/r-1');

    expect(await screen.findByRole('heading', { name: 'Developer' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = await screen.findByDisplayValue('Developer');
    await user.clear(input);
    await user.type(input, 'Platform');
    // First Save = the identity form footer (the permissions section's Save sits
    // below and stays disabled until its own draft is dirty).
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/roles/r-1');
      expect(put?.body).toEqual({ name: 'Platform', description: 'Ships features' });
    });
    // Edit mode closed: the definition list view is back.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
  });

  it('keeps the definition list read-only for a viewer without iam:role:write', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'iam:role:write' });
    renderAt('/roles/r-1');

    expect(await screen.findByText('Ships features')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
