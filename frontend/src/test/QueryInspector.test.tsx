import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryInspector } from '../components/ui/QueryInspector';

function renderInspector(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(['users', { page: 0 }], [{ id: 'u1', name: 'Ada' }]);
  client.setQueryData(['roles', 'catalog'], [{ id: 'r1' }]);
  render(
    <QueryClientProvider client={client}>
      <QueryInspector />
    </QueryClientProvider>,
  );
  return client;
}

describe('QueryInspector (K-56 F1, dev-only)', () => {
  it('is collapsed by default and opens on toggle', async () => {
    renderInspector();
    const toggle = screen.getByRole('button', { name: 'Query inspector' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close query inspector' })).toBeInTheDocument();
  });

  it('lists cache entries with success status', async () => {
    renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Query inspector' }));
    expect(screen.getByText(/\["users",\{"page":0\}\]/)).toBeInTheDocument();
    expect(screen.getByText(/\["roles","catalog"\]/)).toBeInTheDocument();
    expect(screen.getAllByText('success').length).toBe(2);
  });

  it('filters entries by key substring', async () => {
    renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Query inspector' }));
    await userEvent.type(screen.getByLabelText('Filter query keys'), 'users');
    expect(screen.getByText(/\["users",\{"page":0\}\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\["roles","catalog"\]/)).not.toBeInTheDocument();
  });

  it('reflects cache updates while open', async () => {
    const client = renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Query inspector' }));
    client.setQueryData(['modules', 'active'], []);
    expect(await screen.findByText(/\["modules","active"\]/)).toBeInTheDocument();
  });
});
