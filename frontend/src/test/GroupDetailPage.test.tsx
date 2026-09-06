import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupDetailPage } from '../features/groups/GroupDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const GROUP = {
  id: 'g-1',
  name: 'Developers',
  description: null,
  active: true,
  roles: [{ id: 'r-1', name: 'Developer' }],
  members: [{ id: 'u-1', email: 'jane@acme.dev' }],
  memberCount: 1,
};

const CREATED_GROUP = {
  id: 'g-9',
  name: 'SRE',
  description: null,
  active: true,
  roles: [],
  members: [],
  memberCount: 0,
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 200, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string; body?: unknown }[];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = EMPTY_PAGE;
      if (url === `/api/v1/groups/${GROUP.id}`) body = GROUP;
      else if (url === `/api/v1/groups/${GROUP.id}/effective-permissions`) body = ['iam:user:read'];
      else if (url === '/api/v1/groups/g-9/effective-permissions') body = [];
      else if (url === '/api/v1/groups/g-9') body = CREATED_GROUP;
      else if (url === '/api/v1/groups' && method === 'POST') body = CREATED_GROUP;
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
          <Route path="/groups/new" element={<GroupDetailPage />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GroupDetailPage (write gating)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the multi-select editing surfaces to an iam:group:write holder', async () => {
    renderAt(`/groups/${GROUP.id}`);

    // The effective-permissions panel renders once the group query resolves.
    expect(
      await screen.findByRole('heading', { name: /Effective permissions this group grants/ }),
    ).toBeInTheDocument();
    // Two AssignSections (roles + members), each with a picker and a Save.
    expect(await screen.findAllByRole('combobox')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(2);
  });

  it('renders read-only badges without pickers or Save for a read-only viewer', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'iam:group:write' });
    renderAt(`/groups/${GROUP.id}`);

    // Current assignments visible as badges — no editing surfaces, no Save (403 trap).
    expect(await screen.findByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('jane@acme.dev')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('creates at /groups/new: POSTs, then lands on the created group page', async () => {
    const user = userEvent.setup();
    renderAt('/groups/new');

    await user.type(await screen.findByPlaceholderText('e.g. Engineering'), 'SRE');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/groups');
      expect(post?.body).toEqual({ name: 'SRE', active: true });
    });
    // Navigation to the created group: the page heading flips to its name.
    expect(await screen.findByRole('heading', { name: /SRE/ })).toBeInTheDocument();
  });
});
