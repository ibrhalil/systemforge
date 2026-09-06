import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordBoard } from '../features/custom-apps/components/RecordBoard';
import { cellDisplay } from '../features/custom-apps/cellValue';
import type { CustomAppDetail, CustomAppRecord, CustomAppView } from '../features/custom-apps/types';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const APP_ID = '22222222-2222-2222-2222-222222222222';

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
    { id: 'p-title', customAppId: APP_ID, name: 'Title', type: 'TEXT', config: null, required: false, position: 0 },
    { id: 'p-status', customAppId: APP_ID, name: 'Status', type: 'SELECT', config: { options: ['Todo', 'Done'] }, required: false, position: 1 },
  ],
  views: [],
};

const VIEW: CustomAppView = {
  id: 'v-board',
  customAppId: APP_ID,
  name: 'Board',
  type: 'BOARD',
  config: { groupBy: 'p-status' },
  position: 0,
};

const R1: CustomAppRecord = { id: 'r-1', customAppId: APP_ID, values: { 'p-title': 'Fix login', 'p-status': 'Todo' }, createdDate: '2026-08-10T09:00:00Z', updatedAt: '2026-08-10T09:00:00Z', createdBy: 'u1' };
const R2: CustomAppRecord = { id: 'r-2', customAppId: APP_ID, values: { 'p-title': 'Ship release', 'p-status': 'Done' }, createdDate: '2026-08-11T09:00:00Z', updatedAt: '2026-08-11T09:00:00Z', createdBy: 'u1' };
const R3: CustomAppRecord = { id: 'r-3', customAppId: APP_ID, values: { 'p-title': 'No status' }, createdDate: '2026-08-12T09:00:00Z', updatedAt: '2026-08-12T09:00:00Z', createdBy: 'u1' };

const resolve = cellDisplay;

let calls: { method: string; url: string; body?: string }[] = [];

function renderBoard(props: Partial<Parameters<typeof RecordBoard>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RecordBoard
        customApp={APP}
        view={VIEW}
        records={[R1, R2, R3]}
        isLoading={false}
        resolve={resolve}
        onRequestDelete={vi.fn()}
        onRequestEdit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('RecordBoard', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? String(init.body) : undefined });
        return new Response(JSON.stringify(R1), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('derives columns from the groupBy options plus an empty bucket', () => {
    renderBoard();

    // 'Todo'/'Done' each appear twice: column badge + the card mover's selected
    // value of the card living in that column. 'No value' only heads the bucket.
    expect(screen.getAllByText('Todo')).toHaveLength(2);
    expect(screen.getAllByText('Done')).toHaveLength(2);
    expect(screen.getAllByText('No value')).toHaveLength(1);
    // Cards render.
    expect(screen.getByText('Fix login')).toBeInTheDocument();
    expect(screen.getByText('Ship release')).toBeInTheDocument();
    expect(screen.getByText('No status')).toBeInTheDocument();
  });

  it('moves a card across columns by PATCHing the groupBy value', async () => {
    const user = userEvent.setup();
    renderBoard();

    // First mover belongs to the first card (Fix login — Todo).
    const mover = screen.getAllByRole('combobox')[0];
    await user.click(mover);
    await user.click(await screen.findByRole('option', { name: 'Done' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.url).toBe(`/api/v1/custom-apps/${APP_ID}/records/r-1`);
      expect(JSON.parse(patch!.body!)).toEqual({ values: { 'p-status': 'Done' } });
    });
  });

  it('hides the mover without apps:record:write', () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'apps:record:write' });
    renderBoard();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // Cards still render read-only.
    expect(screen.getByText('Fix login')).toBeInTheDocument();
  });

  it('opens the record form through the card overflow menu edit action', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderBoard({ onRequestEdit: onEdit });

    // Edit lives inside the card's overflow menu (RecordGallery pattern), not as a button.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(R1);
  });

  it('falls back to an empty state when the groupBy property is gone', () => {
    renderBoard({ view: { ...VIEW, config: { groupBy: 'p-missing' } } });
    expect(screen.getByText(/group-by property is missing/i)).toBeInTheDocument();
  });

  it('marks cards draggable and columns droppable while apps:record:write is held', () => {
    renderBoard();

    const card = screen.getByText('Fix login').closest('article');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('aria-roledescription', 'draggable');
    expect(card).toHaveStyle({ touchAction: 'manipulation' });

    for (const id of ['col:Todo', 'col:Done', 'col:__empty']) {
      expect(document.querySelector(`[data-droppable-id="${id}"]`)).toBeInTheDocument();
    }
  });

  it('renders cards without draggable attributes when writing is not allowed', () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'apps:record:write' });
    renderBoard();

    const card = screen.getByText('Fix login').closest('article');
    expect(card).not.toHaveAttribute('role');
    expect(card).not.toHaveAttribute('aria-roledescription');
  });

  it('moves optimistically through the records cache and rolls back when the PATCH fails', async () => {
    // The optimistic write targets the underlying records query — verified end
    // to end through RecordsPanel, whose grouping recomputes from the cache.
    const { RecordsPanel } = await import('../features/custom-apps/components/RecordsPanel');
    const recordsPage = {
      data: [R1, R2, R3],
      meta: { page: 0, pageSize: 1000, totalElements: 3, totalPages: 1, hasNext: false, hasPrevious: false },
    };
    let resolvePatch!: (res: Response) => void;
    const patchGate = new Promise<Response>((res) => {
      resolvePatch = res;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, url, body: init?.body ? String(init.body) : undefined });
        if (method === 'PATCH') return patchGate;
        if (url.includes('/plan-limits')) {
          return Promise.resolve(new Response(JSON.stringify({ maxRecordsPerCustomApp: -1 }), { status: 200 }));
        }
        // 'size=1000'.includes('size=1') is true — compare the parsed param, not substrings.
        const pageSize = new URLSearchParams(url.split('?')[1] ?? '').get('size');
        const body =
          url.includes(`/api/v1/custom-apps/${APP_ID}/records`) && pageSize === '1'
            ? { data: [], meta: { page: 0, pageSize: 1, totalElements: 3, totalPages: 3, hasNext: true, hasPrevious: false } }
            : recordsPage;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecordsPanel customApp={{ ...APP, views: [VIEW] }} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // First mover belongs to the first card (Fix login — Todo).
    const user = userEvent.setup();
    const movers = await screen.findAllByRole('combobox');
    await user.click(movers[0]);
    await user.click(await screen.findByRole('option', { name: 'Done' }));

    // Optimistic: the card lands in the Done column before the PATCH resolves.
    await waitFor(() => {
      expect(document.querySelector('[data-droppable-id="col:Done"]')).toContainElement(screen.getByText('Fix login'));
    });
    expect(document.querySelector('[data-droppable-id="col:Todo"]')).not.toContainElement(
      screen.getByText('Fix login'),
    );
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe(`/api/v1/custom-apps/${APP_ID}/records/r-1`);
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({ values: { 'p-status': 'Done' } });

    resolvePatch(new Response(JSON.stringify({ code: 'internal_error' }), { status: 500 }));
    await waitFor(() => {
      expect(document.querySelector('[data-droppable-id="col:Todo"]')).toContainElement(screen.getByText('Fix login'));
    });
  });
});
