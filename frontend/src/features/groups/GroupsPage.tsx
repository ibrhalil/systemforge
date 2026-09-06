import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Group } from './types';
import { useGroups, useDeleteGroup } from './hooks';
import { rolesApi } from '../roles/api';
import { usersApi } from '../users/api';
import { notify } from '../../lib/notify';
import { LuTrash2, LuUsersRound } from 'react-icons/lu';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { SearchInput } from '../../components/ui/SearchInput';
import { RowMenu } from '../../components/ui/RowMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Page } from '../../components/Page';
import { Badge } from '../../components/ui/Badge';
import { useT } from '../../lib/i18n';
import { useListPageState } from '../../lib/useListPageState';
import { useAuthStore } from '../../store/authStore';

export function GroupsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    sort,
    toggleSort,
    search,
    setSearch,
    searchFields,
    setSearchFields,
    filters,
    setFilters,
    q,
    listParams,
  } = useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'groups', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = useGroups(listParams);
  const delGroup = useDeleteGroup();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.GROUP_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.GROUP_DELETE));

  const [deleting, setDeleting] = useState<Group | null>(null);

  // Aligned with the backend's searchable registrations (GroupService.FILTER_FIELDS).
  const groupSearchFields = [
    { key: 'name', label: t('common.group'), searchable: true },
    { key: 'description', label: t('common.description'), searchable: true },
    { key: 'active', label: t('common.status'), searchable: false },
    { key: 'roleIds', label: t('common.roles'), searchable: false },
    { key: 'memberIds', label: t('common.members'), searchable: false },
  ];

  const roleOptionsLoader = (input: string) =>
    rolesApi.list({ q: input || undefined, size: 50 }).then((p) =>
      p.items.map((r) => ({ value: r.id, label: r.name })),
    );
  const memberOptionsLoader = (input: string) =>
    usersApi.list({ q: input || undefined, size: 50 }).then((p) =>
      p.items.map((u) => ({ value: u.id, label: u.email })),
    );

  const columns: Column<Group>[] = [
    {
      key: 'name',
      header: t('common.group'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (g) => <Link to={`/groups/${g.id}`} className="font-medium text-main transition-colors hover:text-accent">{g.name}</Link>,
    },
    {
      key: 'description',
      header: t('common.description'),
      sortKey: 'description',
      filter: { field: 'description', control: 'text' },
      render: (g) => <span className="text-muted">{g.description ?? '—'}</span>,
    },
    {
      key: 'active',
      header: t('common.status'),
      sortKey: 'active',
      filter: { field: 'active', control: 'boolean' },
      render: (g) => <Badge tone={g.active ? 'green' : 'muted'}>{g.active ? t('common.active') : t('common.inactive')}</Badge>,
    },
    {
      key: 'roles',
      header: t('common.roles'),
      // Count chip sorts by the count; filtering targets membership (K-49 option C).
      sortKey: 'roleCount',
      filter: { field: 'roleIds', control: 'multiselect', optionsLoader: roleOptionsLoader },
      render: (g) =>
        g.roles.length ? (
          <span>
            <span className="font-semibold text-accent">{g.roles.length}</span>{' '}
            <span className="lowercase text-muted">{t('common.roles')}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'memberCount',
      header: t('common.members'),
      sortKey: 'memberCount',
      filter: {
        field: 'memberIds',
        control: 'multiselect',
        optionsLoader: memberOptionsLoader,
      },
      render: (g) => <span className="font-semibold text-accent-blue">{g.memberCount}</span>,
    },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('nav.identity') }, { label: t('nav.groups') }]}
      title={t('groups.title')}
      description={t('groups.desc')}
      actions={canWrite ? <Button variant="primary" onClick={() => navigate('/groups/new')}>{t('groups.new')}</Button> : undefined}
    >

      <DataTable<Group>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(g) => g.id}
        storageKey="groups"
        emptyIcon={LuUsersRound}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={q ? t('groups.emptyFiltered') : t('groups.empty')}
        page={data?.page ?? page}
        pageSize={data?.size ?? pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        totalElements={data?.totalElements ?? 0}
        totalPages={data?.totalPages ?? 0}
        onPageChange={setPage}
        sort={sort}
        onSortChange={toggleSort}
        filters={filters}
        onFiltersChange={setFilters}
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('groups.searchPh')}
            fields={groupSearchFields}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        }
        actionsHeader={t('common.actions')}
        actions={(g) => (
          <RowMenu
            ariaLabel={t('common.actions')}
            items={[
              // Create/edit live on the detail page (CRUD surface rule) — the row
              // menu carries only the destructive action.
              ...(canDelete ? [{ label: t('common.delete'), onClick: () => setDeleting(g), icon: LuTrash2, danger: true }] : []),
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('groups.deleteTitle')}
        message={t('groups.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delGroup.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try { await delGroup.mutateAsync(deleting.id); notify.success(t('groups.deleted')); setDeleting(null); } catch { /* global toast */ }
        }}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}

