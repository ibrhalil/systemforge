import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomAppDetailPage } from '../features/custom-apps/CustomAppDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const APP_ID = '11111111-1111-1111-1111-111111111111';

const APP_DETAIL = {
  id: APP_ID,
  name: 'Order Tracking',
  description: null,
  icon: null,
  createdDate: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  properties: [
    { id: 'p-text', customAppId: APP_ID, name: 'Title', type: 'TEXT', config: null, required: true, position: 0 },
    { id: 'p-select', customAppId: APP_ID, name: 'Status', type: 'SELECT', config: { options: ['open', 'done'] }, required: false, position: 1 },
    { id: 'p-user', customAppId: APP_ID, name: 'Owner', type: 'USER', config: null, required: false, position: 2 },
  ],
  views: [],
};

const RECORDS_PAYLOAD = {
  data: [
    {
      id: 'r-1',
      customAppId: APP_ID,
      values: { 'p-text': 'First order', 'p-select': 'open', 'p-user': '12345678-90ab-cdef-1234-567890abcdef' },
      createdDate: '2026-08-10T09:00:00Z',
      updatedAt: '2026-08-10T09:00:00Z',
      createdBy: 'u1',
    },
  ],
  meta: { page: 0, pageSize: 10, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/custom-apps/${APP_ID}`]}>
        <Routes>
          <Route path="/custom-apps/:customAppId" element={<CustomAppDetailPage />} />
          <Route path="/apps/:customAppId/records/new" element={<div>RECORD_NEW_PAGE</div>} />
          <Route path="/custom-apps" element={<div>APPS_LIST</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomAppDetailPage', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/records') ? RECORDS_PAYLOAD : APP_DETAIL;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders properties as table columns with typed cell values', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Order Tracking' })).toBeInTheDocument();
    expect(await screen.findByText('First order')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    // USER cell shows the shortened raw id until a picker exists.
    expect(screen.getByText('12345678…')).toBeInTheDocument();
    // Column headers come from property names.
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  });

  it('shows the type badge list in the properties panel', async () => {
    renderPage();

    // Property name appears in the panel row and as a table column header.
    expect((await screen.findAllByText('Title')).length).toBeGreaterThan(0);
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    // Properties are columns — the panel lays them out as a wrapping chip row,
    // not a full-width vertical list.
    const panelList = screen.getByText('Title', { selector: 'ul span' }).closest('ul');
    expect(panelList).toHaveClass('flex-wrap');
  });

  it('navigates to the record create page from the records panel', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new record/i }));
    expect(await screen.findByText('RECORD_NEW_PAGE')).toBeInTheDocument();
  });
});
