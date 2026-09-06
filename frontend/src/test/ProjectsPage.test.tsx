import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

/** ACTIVE-module catalog (GET /projects/types) — the create page derives from it (K-45). */
let typesPayload: { type: string; moduleKey: string; defaultProjectId: string | null }[];

function stubTypes() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url === '/api/v1/projects/types'
        ? typesPayload
        : EMPTY_PAGE;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderCreatePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects/new']}>
        <Routes>
          <Route path="/projects/new" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Project create page (typed container catalog)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    typesPayload = [{ type: 'TASKS', moduleKey: 'pm', defaultProjectId: null }];
    stubTypes();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers only the ACTIVE modules' types", async () => {
    const user = userEvent.setup();
    renderCreatePage();

    // Open the type select — only the TASKS entry (notes/apps not activated).
    await user.click(await screen.findByText('Pick a type…'));
    expect(await screen.findByRole('option', { name: /Tasks — task board/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Notes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Apps/ })).not.toBeInTheDocument();
  });

  it('lists every catalog type once the modules are active', async () => {
    typesPayload = [
      { type: 'TASKS', moduleKey: 'pm', defaultProjectId: null },
      { type: 'NOTES', moduleKey: 'notes', defaultProjectId: 'p-notes' },
      { type: 'APPS', moduleKey: 'apps', defaultProjectId: 'p-apps' },
    ];
    const user = userEvent.setup();
    renderCreatePage();

    await user.click(await screen.findByText('Pick a type…'));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Tasks — task board/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Notes — note collection/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Apps — custom app collection/ })).toBeInTheDocument();
    });
  });

  it('hides the create action without pm:project:write', () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'pm:project:write' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProjectsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('button', { name: /New Project/ })).not.toBeInTheDocument();
  });
});
