import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordPage } from '../features/custom-apps/RecordPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import type { CustomAppDetail, CustomAppRecord } from '../features/custom-apps/types';

const APP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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
    { id: 'p-title', customAppId: APP_ID, name: 'Title', type: 'TEXT', config: null, required: true, position: 0 },
    { id: 'p-count', customAppId: APP_ID, name: 'Count', type: 'NUMBER', config: null, required: false, position: 1 },
  ],
  views: [],
};

const RECORD: CustomAppRecord = {
  id: 'r-1',
  customAppId: APP_ID,
  values: { 'p-title': 'Old title', 'p-count': 5 },
  createdDate: '2026-08-10T09:00:00Z',
  updatedAt: '2026-08-10T09:00:00Z',
  createdBy: 'u1',
};

const RECORDS_PAGE = {
  data: [RECORD],
  meta: { page: 0, pageSize: 1000, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
};

const EMPTY_PAGE = { data: [], meta: { page: 0, pageSize: 100, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };

let calls: { method: string; url: string; body?: string }[] = [];

function stubFetch(payloads: { app?: unknown; records?: unknown } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? String(init.body) : undefined });
      const body = url === `/api/v1/custom-apps/${APP_ID}`
        ? (payloads.app ?? APP)
        : url.startsWith(`/api/v1/custom-apps/${APP_ID}/records`)
          ? (payloads.records ?? RECORDS_PAGE)
          : EMPTY_PAGE;
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
          <Route path="/apps/:customAppId/records/new" element={<RecordPage />} />
          <Route path="/apps/:customAppId/records/:recordId" element={<RecordPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Edit tests start from the view mode and enter the in-page edit mode. */
async function startEdit(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Record' });
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await screen.findByRole('button', { name: 'Save' });
}

describe('RecordPage', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the stored values in view mode, then prefills the edit draft', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/r-1`);

    // View mode definition list carries the stored values.
    expect(await screen.findByText('Old title')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    await startEdit(user);
    expect(screen.getByLabelText('Title *')).toHaveValue('Old title');
    expect(screen.getByLabelText('Count')).toHaveValue(5);
  });

  it('PATCHes only the changed key (partial merge)', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/r-1`);

    await startEdit(user);
    const title = screen.getByLabelText('Title *');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.url).toBe(`/api/v1/custom-apps/${APP_ID}/records/r-1`);
      expect(JSON.parse(patch!.body!)).toEqual({ values: { 'p-title': 'New title' } });
    });
  });

  it('clears an emptied optional cell with null', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/r-1`);

    await startEdit(user);
    await user.clear(screen.getByLabelText('Count'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(JSON.parse(patch!.body!)).toEqual({ values: { 'p-count': null } });
    });
  });

  it('blocks clearing a required property inline without sending a PATCH', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/r-1`);

    await startEdit(user);
    await user.clear(screen.getByLabelText('Title *'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This required property cannot be emptied.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });

  it('sends nothing and stays on the page when nothing changed', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/r-1`);

    await startEdit(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });

  it('POSTs only the filled fields on create', async () => {
    const user = userEvent.setup();
    renderAt(`/apps/${APP_ID}/records/new`);

    expect(await screen.findByRole('heading', { name: 'New record' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title *'), 'First');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post).toBeDefined();
      expect(post!.url).toBe(`/api/v1/custom-apps/${APP_ID}/records`);
      expect(JSON.parse(post!.body!)).toEqual({ values: { 'p-title': 'First' } });
    });
  });
});
