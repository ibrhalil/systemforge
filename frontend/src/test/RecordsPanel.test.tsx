import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordsPanel } from '../features/custom-apps/components/RecordsPanel';
import type { CustomAppDetail } from '../features/custom-apps/types';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const APP_ID = '77777777-7777-7777-7777-777777777777';

function appFixture(views: CustomAppDetail['views']): CustomAppDetail {
  return {
    id: APP_ID,
    projectId: 'proj-1',
    projectName: 'Genel',
    name: 'Orders',
    description: null,
    icon: null,
    createdDate: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    properties: [
      { id: 'p-title', customAppId: APP_ID, name: 'Title', type: 'TEXT', config: null, required: false, position: 0 },
      { id: 'p-status', customAppId: APP_ID, name: 'Status', type: 'SELECT', config: { options: ['Todo', 'Done'] }, required: false, position: 1 },
    ],
    views,
  };
}

const RECORDS_PAYLOAD = {
  data: [
    { id: 'r-1', customAppId: APP_ID, values: { 'p-title': 'First order', 'p-status': 'Todo' }, createdDate: '2026-08-10T09:00:00Z', updatedAt: '', createdBy: 'u1' },
    { id: 'r-2', customAppId: APP_ID, values: { 'p-title': 'Second order', 'p-status': 'Done' }, createdDate: '2026-08-11T09:00:00Z', updatedAt: '', createdBy: 'u1' },
  ],
  meta: { page: 0, pageSize: 10, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

const EMPTY_PAGE = { data: [], meta: { page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } };

let urls: { method: string; url: string }[] = [];

function renderPanel(customApp: CustomAppDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecordsPanel customApp={customApp} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecordsPanel', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    urls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        urls.push({ method: init?.method ?? 'GET', url });
        const body = url.includes('/users') ? EMPTY_PAGE : url.includes('/records') ? RECORDS_PAYLOAD : { id: APP_ID };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the plain self-paginated table when the customApp has no views', async () => {
    renderPanel(appFixture([]));

    expect(await screen.findByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    expect(await screen.findByText('First order')).toBeInTheDocument();
    // No tabs, but the classic section description and New record button.
    expect(screen.getByText(/TABLE view — column = property/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new record/i })).toBeInTheDocument();
  });

  it('renders view tabs and switches renderers per view type', async () => {
    const user = userEvent.setup();
    renderPanel(
      appFixture([
        { id: 'v-table', customAppId: APP_ID, name: 'All', type: 'TABLE', config: null, position: 0 },
        { id: 'v-board', customAppId: APP_ID, name: 'By status', type: 'BOARD', config: { groupBy: 'p-status' }, position: 1 },
      ]),
    );

    // Default = first view (TABLE): DataTable columns.
    expect(await screen.findByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    // Both tabs exist.
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By status' })).toBeInTheDocument();

    // Switch to the BOARD view: kanban columns appear, table headers go away.
    await user.click(screen.getByRole('button', { name: 'By status' }));
    // 'Todo'/'Done' appear twice each: column badge + the card mover's value.
    expect(await screen.findAllByText('Todo')).toHaveLength(2);
    expect(screen.getAllByText('Done')).toHaveLength(2);
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
    // Client-mode fetch is a single bounded page.
    expect(urls.some((u) => u.url.includes(`/api/v1/custom-apps/${APP_ID}/records`) && u.url.includes('size=1000'))).toBe(true);
  });

  it('applies a transient filter client-side without saving it to the view', async () => {
    const user = userEvent.setup();
    renderPanel(appFixture([{ id: 'v-table', customAppId: APP_ID, name: 'All', type: 'TABLE', config: null, position: 0 }]));

    expect(await screen.findByText('Second order')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(screen.getByRole('button', { name: 'Add filter' }));

    // Default TEXT op is EQ — an exact match on the full value.
    await user.type(screen.getByLabelText('Value'), 'First order');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Client mode: only the matching record remains; nothing was PUT to the view.
    expect(await screen.findByText('First order')).toBeInTheDocument();
    expect(screen.queryByText('Second order')).not.toBeInTheDocument();
    expect(urls.find((u) => u.method === 'PUT')).toBeUndefined();
    // Active filter count badge on the toggle.
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
