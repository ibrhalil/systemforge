import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssignRolesModal } from '../features/users/components/AssignRolesModal';
import { GroupDetailPage } from '../features/groups/GroupDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const USER_DETAIL = {
  id: 'u-1',
  email: 'jane@acme.dev',
  username: 'jane',
  emailVerified: true,
  firstName: null,
  lastName: null,
  enabled: true,
  lockedUntil: null,
  roles: [{ id: 'r-1', name: 'Developer' }],
  groups: [],
};

const ROLES_PAGE = {
  data: [
    { id: 'r-1', name: 'Developer', description: null, allPermissions: false, permissions: [] },
    { id: 'r-2', name: 'Ops', description: null, allPermissions: false, permissions: [] },
  ],
  meta: { page: 0, pageSize: 20, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

const GROUP = {
  id: 'g-1',
  name: 'Developers',
  description: null,
  active: true,
  roles: [{ id: 'r-1', name: 'Developer' }],
  members: [],
  memberCount: 0,
};

const GROUPS_PAGE = {
  data: [GROUP],
  meta: { page: 0, pageSize: 10, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string; body?: unknown }[];

function stub(payloads: {
  detail?: unknown;
  roles?: unknown;
  groups?: unknown;
  detailStatus?: number;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = { data: [], meta: { page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };
      let status = 200;
      if (url === '/api/v1/users/u-1') {
        body = payloads.detail ?? USER_DETAIL;
        status = payloads.detailStatus ?? 200;
      } else if (url === '/api/v1/groups/g-1') {
        body = GROUP;
      } else if (url === '/api/v1/groups/g-1/effective-permissions') {
        body = ['iam:user:read'];
      } else if (url.startsWith('/api/v1/roles')) {
        body = payloads.roles ?? ROLES_PAGE;
      } else if (url.startsWith('/api/v1/groups')) {
        body = payloads.groups ?? GROUPS_PAGE;
      }
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AssignRolesModal (async multi picker)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stub({});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('seeds the current roles, appends a searched pick and saves the id set', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssignRolesModal user={{ id: 'u-1', email: 'jane@acme.dev' }} onClose={vi.fn()} />);

    // Detail-driven seed chip once the user query lands.
    expect(await screen.findByText('Developer')).toBeInTheDocument();

    const combobox = await screen.findByRole('combobox');
    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: 'Ops' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/users/u-1/roles');
      expect(put?.body).toEqual({ roleIds: ['r-1', 'r-2'] });
    });
  });
});

describe('GroupDetailPage roles AssignSection (async multi picker)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stub({});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('assigns roles through the async picker and PUTs the selection', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/groups/g-1']}>
          <Routes>
            <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Seed chip from the group's current roles (roles section = first combobox).
    expect(await screen.findAllByRole('combobox')).toHaveLength(2);

    const combobox = screen.getAllByRole('combobox')[0];
    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: 'Ops' }));

    // Roles section Save (first of the two section footers).
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/groups/g-1/roles');
      expect(put?.body).toEqual({ roleIds: ['r-1', 'r-2'] });
    });
  });
});
