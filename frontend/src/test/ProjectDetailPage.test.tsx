import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import { decodedSq } from './sqUrl';

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 50, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

let projectPayload: {
  id: string;
  name: string;
  description: string | null;
  type: string;
  parentProjectId: string | null;
  isDefault: boolean;
} | null;

let calls: { url: string; method: string; body?: unknown }[];

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/new" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          {/* Marker route: the APPS panel create target (?projectId= anchor). */}
          <Route
            path="/apps/new"
            element={<AppsNewMarker />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function AppsNewMarker() {
  const [params] = useSearchParams();
  return <div>APPS_NEW projectId={params.get('projectId')}</div>;
}

/** A NOTES container whose nested panel data flows through ?projectId= (K-45). */
describe('ProjectDetailPage (typed container bodies)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    projectPayload = null;
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
        // Active-module type catalog (backs the create/edit type select).
        if (url === '/api/v1/projects/types') {
          return new Response(JSON.stringify([
            { type: 'TASKS', moduleKey: 'pm', defaultProjectId: null },
            { type: 'NOTES', moduleKey: 'notes', defaultProjectId: null },
            { type: 'APPS', moduleKey: 'apps', defaultProjectId: null },
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const projectId = projectPayload?.id ?? 'p-1';
        if (url === `/api/v1/projects/${projectId}`) {
          if (!projectPayload) return new Response(JSON.stringify({ code: 'resource_not_found' }), { status: 404 });
          return new Response(JSON.stringify(projectPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const payload = url.includes('/notes?')
          ? {
              data: [
                {
                  id: 'note-1',
                  title: 'Kickoff decisions',
                  content: 'md',
                  projectId,
                  projectName: projectPayload?.name ?? 'P',
                  categoryId: null,
                  categoryName: null,
                  pinned: false,
                  updatedAt: '2026-08-23T09:00:00Z',
                },
              ],
              meta: { page: 0, pageSize: 50, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
            }
          : url.includes('/custom-apps?')
            ? {
                data: [
                  {
                    id: 'customApp-1',
                    name: 'CRM',
                    description: null,
                    icon: '📊',
                    projectId,
                    projectName: projectPayload?.name ?? 'P',
                    createdDate: '2026-08-23T09:00:00Z',
                    updatedAt: '2026-08-23T09:00:00Z',
                  },
                ],
                meta: { page: 0, pageSize: 100, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false },
              }
            : EMPTY_PAGE;
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates at /projects/new: POSTs the typed container, then lands on its page', async () => {
    const user = userEvent.setup();
    renderAt('/projects/new');

    await user.type(await screen.findByPlaceholderText('e.g. Sprint Board'), 'Sprint Board');
    await user.click(screen.getByText('Pick a type…'));
    await user.click(await screen.findByRole('option', { name: /Tasks — task board/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/projects');
      expect(post?.body).toEqual({ name: 'Sprint Board', type: 'TASKS' });
    });
  });

  it('a NOTES project renders its notes scoped to the container', async () => {
    projectPayload = {
      id: 'p-notes',
      name: 'Team Journal',
      description: null,
      type: 'NOTES',
      parentProjectId: null,
      isDefault: false,
    };
    renderAt('/projects/p-notes');

    expect(await screen.findByText('Kickoff decisions')).toBeInTheDocument();
    expect(screen.getByText('Notes in this project')).toBeInTheDocument();

    await waitFor(() => {
      const list = calls.find((c) => c.url.includes('/api/v1/notes?'));
      expect(decodedSq(list?.url ?? '')?.filters?.some(
        (f) => f.field === 'projectId' && f.values.includes('p-notes'))).toBe(true);
    });
  });

  it('an APPS project renders its customApp collection and anchors create to the container', async () => {
    const user = userEvent.setup();
    projectPayload = {
      id: 'p-customApps',
      name: 'Ops Apps',
      description: null,
      type: 'APPS',
      parentProjectId: null,
      isDefault: false,
    };
    renderAt('/projects/p-customApps');

    expect(await screen.findByText('📊 CRM')).toBeInTheDocument();
    expect(screen.getByText('Apps in this project')).toBeInTheDocument();

    // Create navigates to the app page anchored to this container (?projectId=,
    // K-58 — entity create is a page, not a modal).
    await user.click(screen.getByRole('button', { name: '+ New Custom App' }));
    expect(await screen.findByText('APPS_NEW projectId=p-customApps')).toBeInTheDocument();
  });
});
