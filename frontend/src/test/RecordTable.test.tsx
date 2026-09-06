import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordTable } from '../features/custom-apps/components/RecordTable';
import type { CustomAppDetail } from '../features/custom-apps/types';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const APP_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '12345678-90ab-cdef-1234-567890abcdef';

const APP: CustomAppDetail = {
  id: APP_ID,
  projectId: 'proj-1',
  projectName: 'Genel',
  name: 'Orders',
  description: null,
  icon: null,
  createdDate: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  properties: [
    { id: 'p-text', customAppId: APP_ID, name: 'Title', type: 'TEXT', config: null, required: false, position: 0 },
    { id: 'p-user', customAppId: APP_ID, name: 'Owner', type: 'USER', config: null, required: false, position: 1 },
  ],
  views: [],
};

const RECORD = {
  id: 'r-1',
  customAppId: APP_ID,
  values: { 'p-text': 'Old title', 'p-user': USER_ID },
  createdDate: '2026-08-10T09:00:00Z',
  updatedAt: '2026-08-10T09:00:00Z',
  createdBy: 'u1',
};

const RECORDS_PAYLOAD = {
  data: [RECORD],
  meta: { page: 0, pageSize: 10, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
};

/** Directory page containing the record's owner (jane) + a second user (john). */
const USERS_PAYLOAD = {
  data: [
    { id: USER_ID, email: 'jane@acme.com' },
    { id: 'u-john', email: 'john@acme.com' },
  ],
  meta: { page: 0, pageSize: 100, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

const EMPTY_PAGE = { data: [], meta: { page: 0, pageSize: 100, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };

let calls: { method: string; url: string; body?: string }[] = [];

function stubFetch(usersPayload: typeof USERS_PAYLOAD | typeof EMPTY_PAGE = USERS_PAYLOAD) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? String(init.body) : undefined });
      const body = url.includes('/users')
        ? usersPayload
        : url.includes('/records') && (init?.method ?? 'GET') === 'GET'
          ? RECORDS_PAYLOAD
          : RECORD;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecordTable customApp={APP} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecordTable inline edit', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('edits a TEXT cell inline and PATCHes the parsed value', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(await screen.findByRole('button', { name: 'Old title' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New title{Enter}');

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.url).toBe(`/api/v1/custom-apps/${APP_ID}/records/${RECORD.id}`);
      expect(JSON.parse(patch!.body!)).toEqual({ values: { 'p-text': 'New title' } });
    });
  });

  it('cancels the edit with Escape without sending anything', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(await screen.findByRole('button', { name: 'Old title' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Discarded{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });

  it('resolves USER cells to directory emails and edits them through the picker', async () => {
    const user = userEvent.setup();
    renderTable();

    // Resolver (useUsers) maps the raw USER id to the directory email.
    const cell = await screen.findByRole('button', { name: 'jane@acme.com' });
    expect(cell).toHaveAttribute('title', 'Edit');

    // Clicking opens the UserPicker; picking another user PATCHes the raw id.
    await user.click(cell);
    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'john');
    await user.click(await screen.findByRole('option', { name: 'john@acme.com' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse(patch!.body!)).toEqual({ values: { 'p-user': 'u-john' } });
    });
  });

  it('falls back to the shortened raw id when the user is not in the directory', async () => {
    calls = [];
    stubFetch(EMPTY_PAGE);
    renderTable();

    const cell = await screen.findByText('12345678…');
    expect(cell).toBeInTheDocument();
  });

  it('hides all editing affordances without apps:record:write', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'apps:record:write' });
    renderTable();

    expect(await screen.findByText('jane@acme.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'jane@acme.com' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Old title' })).not.toBeInTheDocument();
  });

  it('requests the record page through the row actions menu (onRequestEdit contract)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecordTable customApp={APP} onRequestEdit={onEdit} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole('button', { name: 'Actions' }))[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(RECORD);
  });
});
