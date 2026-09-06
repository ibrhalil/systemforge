import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskBoard } from '../features/projects/components/TaskBoard';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';

const TASKS_PAYLOAD = {
  data: [
    {
      id: 't-1',
      projectId: 'p-1',
      title: 'Fix login',
      description: null,
      status: 'TODO',
      priority: 'HIGH',
      assigneeId: null,
      dueDate: null,
      createdDate: '2026-08-20T09:00:00Z',
      updatedDate: '2026-08-20T09:00:00Z',
    },
    {
      id: 't-2',
      projectId: 'p-1',
      title: 'Ship release',
      description: null,
      status: 'DONE',
      priority: 'LOW',
      assigneeId: null,
      dueDate: null,
      createdDate: '2026-08-21T09:00:00Z',
      updatedDate: '2026-08-21T09:00:00Z',
    },
  ],
  meta: { page: 0, pageSize: 1000, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false },
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 0, pageSize: 100, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
};

let calls: { url: string; method: string }[];

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaskBoard projectId="p-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskBoard (card action overflow)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET' });
        const body = url.startsWith('/api/v1/projects/p-1/tasks')
          ? TASKS_PAYLOAD
          : EMPTY_PAGE;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps view/delete inside the card overflow menu — no top-level action buttons', async () => {
    renderBoard();

    expect(await screen.findByText('Fix login')).toBeInTheDocument();
    expect(screen.getByText('Ship release')).toBeInTheDocument();
    // Navigation/destructive actions live only in the RowMenu — no standalone buttons.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0]);
    expect(await screen.findByRole('menuitem', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('card title links to the task detail page', async () => {
    renderBoard();
    const title = await screen.findByRole('link', { name: 'Fix login' });
    expect(title).toHaveAttribute('href', '/projects/p-1/tasks/t-1');
  });

  it('deletes through the menu item and its confirm dialog', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Fix login');

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete task' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/v1/projects/p-1/tasks/t-1')).toBe(true);
    });
  });

  it('shows the shortened id for an assigned-but-unresolved assignee (never "Unassigned")', async () => {
    // Assignee beyond the directory page AND without a resolvable detail.
    const assigned = {
      ...TASKS_PAYLOAD,
      data: TASKS_PAYLOAD.data.map((t, i) => (i === 0 ? { ...t, assigneeId: 'zz9-zed-unresolved' } : t)),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.startsWith('/api/v1/projects/p-1/tasks')
          ? assigned
          : url === '/api/v1/users/zz9-zed-unresolved'
            ? { code: 'resource_not_found' }
            : EMPTY_PAGE;
        const status = body === EMPTY_PAGE || url.startsWith('/api/v1/projects') ? 200 : 404;
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderBoard();
    expect(await screen.findByText('Fix login')).toBeInTheDocument();
    // shortenId("zz9-zed-unresolved") — the ASSIGNED card never renders "Unassigned"
    // (the other, genuinely unassigned card keeps its own label).
    expect(screen.getByText('zz9-zed-…')).toBeInTheDocument();
  });

  it('task modal assignee field is an async UserPicker combobox', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Fix login');

    await user.click(screen.getByRole('button', { name: /New Task/i }));
    const dialog = await screen.findByRole('dialog');
    // The assignee control is a searchable picker (not a static option list).
    expect(dialog.querySelector('input[role="combobox"]')).not.toBeNull();
  });
});

describe('TaskBoard (drag-drop wiring)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en' });
    useAuthStore.setState({ hasAuthority: () => true });
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET' });
        const body = url.startsWith('/api/v1/projects/p-1/tasks') ? TASKS_PAYLOAD : EMPTY_PAGE;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marks cards draggable and columns droppable while pm:task:write is held', async () => {
    renderBoard();
    await screen.findByText('Fix login');

    const card = screen.getByText('Fix login').closest('article');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('aria-roledescription', 'draggable');
    expect(card).toHaveStyle({ touchAction: 'manipulation' });

    for (const id of ['col:TODO', 'col:IN_PROGRESS', 'col:DONE']) {
      expect(document.querySelector(`[data-droppable-id="${id}"]`)).toBeInTheDocument();
    }
  });

  it('renders cards without draggable attributes when writing is not allowed', async () => {
    useAuthStore.setState({ hasAuthority: (a: string) => a !== 'pm:task:write' });
    renderBoard();
    await screen.findByText('Fix login');

    const card = screen.getByText('Fix login').closest('article');
    expect(card).not.toHaveAttribute('role');
    expect(card).not.toHaveAttribute('aria-roledescription');
  });

  it('moves optimistically and rolls back to the old column when the update fails', async () => {
    // Gate the PUT so the optimistic state is observable before it settles.
    let resolvePut!: (res: Response) => void;
    const putGate = new Promise<Response>((res) => {
      resolvePut = res;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET' });
        if ((init?.method ?? 'GET') === 'PUT' && url === '/api/v1/projects/p-1/tasks/t-1') return putGate;
        return Promise.resolve(
          new Response(JSON.stringify(url.startsWith('/api/v1/projects/p-1/tasks') ? TASKS_PAYLOAD : EMPTY_PAGE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Fix login');

    // Same move path a drag end takes — via the card's status mover.
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Done' }));

    // Optimistic: the card jumps to DONE before the PUT resolves.
    await waitFor(() => {
      expect(document.querySelector('[data-droppable-id="col:DONE"]')).toContainElement(screen.getByText('Fix login'));
    });
    expect(document.querySelector('[data-droppable-id="col:TODO"]')).not.toContainElement(screen.getByText('Fix login'));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/v1/projects/p-1/tasks/t-1');

    resolvePut(new Response(JSON.stringify({ code: 'internal_error' }), { status: 500 }));
    await waitFor(() => {
      expect(document.querySelector('[data-droppable-id="col:TODO"]')).toContainElement(screen.getByText('Fix login'));
    });
  });
});
