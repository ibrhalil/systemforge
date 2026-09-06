import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomAppsPage } from '../features/custom-apps/CustomAppsPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

/** GET /api/v1/custom-apps PageResponse payload. */
const APPS_PAYLOAD = {
  data: [
    { id: 'customApp-1', name: 'Order Tracking', description: 'Orders', icon: null, createdDate: '2026-08-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z' },
    { id: 'customApp-2', name: 'Inventory', description: null, icon: null, createdDate: '2026-08-02T10:00:00Z', updatedAt: '2026-08-02T10:00:00Z' },
  ],
  meta: { page: 0, pageSize: 10, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

/** GET /api/v1/custom-apps/plan-limits payload (FREE). */
const PLAN_LIMITS = { planKey: 'free', planName: 'Free', maxCustomApps: 3, maxRecordsPerCustomApp: 1000 };

/** One-row usage probe payload (GET /customApps?size=1). */
const USAGE_PAYLOAD = {
  data: [],
  meta: { page: 0, pageSize: 1, totalElements: 2, totalPages: 2, hasNext: true, hasPrevious: false },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<CustomAppsPage />} />
          <Route path="/apps/new" element={<div>APPS_NEW_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomAppsPage', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/plan-limits')
          ? PLAN_LIMITS
          : /size=1(&|$)/.test(url)
            ? USAGE_PAYLOAD
            : APPS_PAYLOAD;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the customApp rows from the API', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Custom Apps' })).toBeInTheDocument();
    expect(await screen.findByText('Order Tracking')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });

  it("navigates to the app create page (K-58 — entity create is a page, not a modal)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ New Custom App' }));
    expect(await screen.findByText('APPS_NEW_PAGE')).toBeInTheDocument();
  });

  it('shows the plan usage indicator from the plan-limits endpoint', async () => {
    renderPage();

    expect(await screen.findByText('2 / 3 apps')).toBeInTheDocument();
    expect(document.querySelector('.w-28')).toBeInTheDocument();
  });

  it('keeps the plan label but renders no usage bar when maxCustomApps is 0', async () => {
    // maxCustomApps=0 would make usage/maxCustomApps NaN/Infinity — the bar must not render.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/plan-limits')
          ? { ...PLAN_LIMITS, maxCustomApps: 0 }
          : /size=1(&|$)/.test(url)
            ? USAGE_PAYLOAD
            : APPS_PAYLOAD;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    renderPage();

    expect(await screen.findByText('2 / 0 apps')).toBeInTheDocument();
    expect(document.querySelector('.w-28')).not.toBeInTheDocument();
  });
});
