import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskDetailPage } from '../features/projects/TaskDetailPage';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const PROJECT = {
  id: 'p-1',
  name: 'Sprint Board',
  description: null,
  type: 'TASKS',
  parentProjectId: null,
  isDefault: false,
};

const TASK = {
  id: 't-1',
  projectId: 'p-1',
  title: 'Fix login',
  description: 'Session cookie regression',
  status: 'TODO',
  priority: 'HIGH',
  assigneeId: null,
  dueDate: '2026-09-10',
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 200, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string; body?: unknown }[];

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = EMPTY_PAGE;
      if (url === '/api/v1/projects/p-1') body = PROJECT;
      else if (url === '/api/v1/projects/p-1/tasks/t-1') body = TASK;
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
          <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskDetailPage (view + inline edit)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    stub();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the task with its project breadcrumb', async () => {
    renderAt('/projects/p-1/tasks/t-1');

    expect(await screen.findByRole('heading', { name: 'Fix login' })).toBeInTheDocument();
    expect(screen.getByText('Session cookie regression')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sprint Board' })).toHaveAttribute('href', '/projects/p-1');
    // Definition fields: status badge, priority badge, due date.
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText(/10 Sept? 2026/)).toBeInTheDocument();
  });

  it('edits in-page: seeds the draft, PUTs the change and exits edit mode', async () => {
    const user = userEvent.setup();
    renderAt('/projects/p-1/tasks/t-1');

    await screen.findByRole('heading', { name: 'Fix login' });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = await screen.findByDisplayValue('Fix login');
    await user.clear(input);
    await user.type(input, 'Fix login flow');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/projects/p-1/tasks/t-1');
      expect(put?.body).toMatchObject({
        title: 'Fix login flow',
        description: 'Session cookie regression',
        status: 'TODO',
        priority: 'HIGH',
        dueDate: '2026-09-10',
      });
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
  });

  it('keeps the definition list read-only for a viewer without pm:task:write', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'pm:task:write' });
    renderAt('/projects/p-1/tasks/t-1');

    expect(await screen.findByText('Session cookie regression')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
