import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Role } from './types';
import { useRoles, useDeleteRole } from './hooks';
import { permissionsApi } from '../permissions/api';
import { notify } from '../../lib/notify';
import { LuShieldCheck, LuTrash2 } from 'react-icons/lu';
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

export function RolesPage() {
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
  } = useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'roles', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = useRoles(listParams);
  const delRole = useDeleteRole();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.ROLE_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.ROLE_DELETE));

  const [deleting, setDeleting] = useState<Role | null>(null);

  // Aligned with the backend's searchable registrations (RoleService.FILTER_FIELDS).
  const roleSearchFields = [
    { key: 'name', label: t('common.role'), searchable: true },
    { key: 'description', label: t('common.description'), searchable: true },
    { key: 'permissionIds', label: t('common.permissions'), searchable: false },
  ];

  const permissionOptionsLoader = (input: string) =>
    permissionsApi.list().then((page) =>
      page.items
        .filter((p) => !input || p.name.toLowerCase().includes(input.toLowerCase()))
        .slice(0, 50)
        .map((p) => ({ value: p.id, label: p.name })),
    );

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: t('common.role'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (r) => <Link to={`/roles/${r.id}`} className="font-medium text-main transition-colors hover:text-accent">{r.name}</Link>,
    },
    {
      key: 'description',
      header: t('common.description'),
      sortKey: 'description',
      filter: { field: 'description', control: 'text' },
      render: (r) => <span className="text-muted">{r.description ?? '—'}</span>,
    },
    {
      key: 'permissions',
      header: t('common.permissions'),
      // Count chip sorts by the count; filtering targets membership (K-49 option C).
      // The ALL badge sorts as permissionCount=0 (the flag carries no explicit grants).
      sortKey: 'permissionCount',
      filter: { field: 'permissionIds', control: 'multiselect', optionsLoader: permissionOptionsLoader },
      render: (r) =>
        r.allPermissions ? (
          <Badge tone="accent">ALL</Badge>
        ) : r.permissions.length ? (
          <span>
            <span className="font-semibold text-accent">{r.permissions.length}</span>{' '}
            <span className="text-muted">{t('common.permCount')}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('nav.identity') }, { label: t('nav.roles') }]}
      title={t('roles.title')}
      description={t('roles.desc')}
      actions={canWrite ? <Button variant="primary" onClick={() => navigate('/roles/new')}>{t('roles.new')}</Button> : undefined}
    >

      <DataTable<Role>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        storageKey="roles"
        emptyIcon={LuShieldCheck}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={q ? t('roles.emptyFiltered') : t('roles.empty')}
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
            placeholder={t('roles.searchPh')}
            fields={roleSearchFields}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        }
        actionsHeader={t('common.actions')}
        actions={(r) => (
          <RowMenu
            ariaLabel={t('common.actions')}
            items={[
              // Create/edit live on the detail page (CRUD surface rule) — the row
              // menu carries only the destructive action.
              ...(canDelete ? [{ label: t('common.delete'), onClick: () => setDeleting(r), icon: LuTrash2, danger: true }] : []),
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('roles.deleteTitle')}
        message={t('roles.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delRole.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try { await delRole.mutateAsync(deleting.id); notify.success(t('roles.deleted')); setDeleting(null); } catch { /* global toast */ }
        }}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}

