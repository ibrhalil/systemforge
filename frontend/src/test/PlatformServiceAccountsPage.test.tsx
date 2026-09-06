import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlatformServiceAccountsPage } from '../features/platform/PlatformServiceAccountsPage';
import { PlatformServiceAccountCreatePage } from '../features/platform/PlatformServiceAccountCreatePage';
import { useLocaleStore } from '../store/localeStore';

/**
 * K-50 service accounts (K-58 page flow): creating an account lives on its own
 * page; the raw key shows EXACTLY once in a copy modal and closing it returns
 * to the list — the list itself never carries it (raw/hash absent from the wire
 * list response by backend design).
 */

const RAW_KEY = 'ABCD2345_' + 's'.repeat(43);

const LIST_PAYLOAD = {
  data: [],
  meta: { page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

const CREATED_PAYLOAD = {
  id: 'k-1',
  accountId: 'sa-1',
  name: 'CI Agent',
  scopes: ['platform:company:read'],
  keyPrefix: 'ABCD2345',
  expiresAt: null,
  rawKey: RAW_KEY,
};

let calls: { method: string; url: string; body?: string }[];

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/platform/service-accounts']}>
        <Routes>
          <Route path="/platform/service-accounts" element={<PlatformServiceAccountsPage />} />
          <Route path="/platform/service-accounts/new" element={<PlatformServiceAccountCreatePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PlatformServiceAccountsPage', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    window.localStorage.clear();
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? String(init.body) : undefined });
      const isCreate = init?.method === 'POST';
      const payload = isCreate ? CREATED_PAYLOAD : LIST_PAYLOAD;
      return new Response(JSON.stringify(payload), {
        status: isCreate ? 201 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates on the page, shows the raw key exactly once, and returns on close', async () => {
    const user = userEvent.setup();
    renderApp();

    // K-58: the list's create button navigates to the create page.
    await user.click(await screen.findByRole('button', { name: /create service account/i }));
    expect(await screen.findByRole('heading', { name: 'New service account' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name$/i), 'CI Agent');
    // Pick a scope in the multi select.
    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: 'platform:company:read' }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.body).toContain('CI Agent');
    });

    // The one-time modal shows the raw key with the copy action.
    expect(await screen.findByText(RAW_KEY)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();

    // The footer "Close" (the header X also carries aria-label Close) discards
    // the key and navigates back to the list.
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByText(RAW_KEY)).not.toBeInTheDocument();
    // Back on the list page (its heading renders again).
    expect(await screen.findByRole('heading', { name: 'Service Accounts' })).toBeInTheDocument();
  });
});
