import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuEye, LuTrash2 } from 'react-icons/lu';
import type { Permission } from './types';
import {
  usePermissionSearch, useDeletePermission,
} from './hooks';
import { notify } from '../../lib/notify';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { RowMenu } from '../../components/ui/RowMenu';
import { SearchInput } from '../../components/ui/SearchInput';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Page } from '../../components/Page';
import { useT } from '../../lib/i18n';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { useListPageState } from '../../lib/useListPageState';
import { useAuthStore } from '../../store/authStore';

export function PermissionsPage() {
  const { t } = useT();
  const delPermission = useDeletePermission();
  const navigate = useNavigate();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PERMISSION_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PERMISSION_DELETE));

  // Server-side list (K-49): q + qFields + structured column filters all hit the
  // filter engine; the former client-side includes/sort/pagination are gone.
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
  } = useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'permissions', syncUrl: true });

  const { data, isLoading, isFetching, error, refetch } = usePermissionSearch(listParams);
  const hasFilterInput = q.length > 0 || filters.length > 0 || searchFields.length > 0;

  const [deleting, setDeleting] = useState<Permission | null>(null);

  // Aligned with the backend's searchable registrations (PermissionService.FILTER_FIELDS).
  const permissionSearchFields = [
    { key: 'name', label: t('common.permission'), searchable: true },
    { key: 'description', label: t('common.description'), searchable: true },
  ];

  const columns: Column<Permission>[] = [
    {
      key: 'name',
      header: t('common.permission'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (p) => <span className="font-mono text-sm font-medium text-main">{p.name}</span>,
    },
    {
      key: 'description',
      header: t('common.description'),
      sortKey: 'description',
      filter: { field: 'description', control: 'text' },
      render: (p) => <span className="text-muted">{p.description ?? '—'}</span>,
    },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('nav.identity') }, { label: t('nav.permissions') }]}
      title={t('common.permissions')}
      description={<>{t('permissions.desc')} <code className="font-mono text-accent">module:resource:action</code>.</>}
      actions={canWrite ? <Button variant="primary" onClick={() => navigate('/permissions/new')}>{t('permissions.new')}</Button> : undefined}
    >

      <DataTable<Permission>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(p) => p.id}
        storageKey="permissions"
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={hasFilterInput ? t('permissions.emptyFiltered') : t('permissions.empty')}
        page={data?.page ?? page}
        pageSize={data?.size ?? pageSize}
        totalElements={data?.totalElements ?? 0}
        totalPages={data?.totalPages ?? 0}
        onPageChange={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        sort={sort}
        onSortChange={toggleSort}
        filters={filters}
        onFiltersChange={setFilters}
        toolbar={(
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('permissions.searchPh')}
            fields={permissionSearchFields}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        )}
        actionsHeader={t('common.actions')}
        actions={(p) => (
          <RowMenu
            ariaLabel={t('common.actions')}
            items={[
              // Create/edit live on the detail page (CRUD surface rule).
              { label: t('common.view'), onClick: () => navigate(`/permissions/${p.id}`), icon: LuEye },
              ...(canDelete ? [{ label: t('common.delete'), onClick: () => setDeleting(p), icon: LuTrash2, danger: true }] : []),
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('permissions.deleteTitle')}
        message={t('permissions.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delPermission.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delPermission.mutateAsync(deleting.id);
            notify.success(t('permissions.deleted'));
            setDeleting(null);
          } catch { /* global toast */ }
        }}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}
