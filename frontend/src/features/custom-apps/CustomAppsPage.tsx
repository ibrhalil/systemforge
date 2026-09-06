import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuTrash2 } from 'react-icons/lu';
import { Page } from '../../components/Page';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { SearchInput } from '../../components/ui/SearchInput';
import { RowMenu } from '../../components/ui/RowMenu';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { formatDateTime } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useListPageState } from '../../lib/useListPageState';
import { PERMISSIONS } from '../../lib/permissions';
import { useAuthStore } from '../../store/authStore';
import { notify } from '../../lib/notify';
import type { CustomApp } from './types';
import { useCustomApps, useDeleteCustomApp, usePlanLimits } from './hooks';

export function CustomAppsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { page, setPage, pageSize, setPageSize, sort, toggleSort, search, setSearch, searchFields, setSearchFields, filters, setFilters, q, listParams } =
    useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'customApps', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = useCustomApps(listParams);
  // Usage indicator: unfiltered total via a one-row probe (the list above is q-filtered).
  const { data: usage } = useCustomApps({ page: 0, size: 1 });
  const { data: planLimits } = usePlanLimits();
  const delApp = useDeleteCustomApp();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_DELETE));

  const [deleting, setDeleting] = useState<CustomApp | null>(null);

  // Aligned with the backend's searchable registrations (AppBuilderService.FILTER_FIELDS).
  const appSearchFields = [
    { key: 'name', label: t('common.name'), searchable: true },
    { key: 'description', label: t('common.description'), searchable: true },
    { key: 'projectName', label: t('projects.project'), searchable: true },
    { key: 'icon', label: t('customApps.iconLabel'), searchable: false },
    { key: 'projectId', label: t('projects.project'), searchable: false },
    { key: 'createdDate', label: t('customApps.createdDate'), searchable: false },
  ];

  const columns: Column<CustomApp>[] = [
    {
      key: 'name',
      header: t('common.name'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (a) => (
        <Link to={`/apps/${a.id}`} className="font-medium text-main transition-colors hover:text-accent">
          {a.icon ? `${a.icon} ${a.name}` : a.name}
        </Link>
      ),
    },
    {
      key: 'description',
      header: t('common.description'),
      sortKey: 'description',
      filter: { field: 'description', control: 'text' },
      render: (a) => <span className="text-muted">{a.description ?? '—'}</span>,
    },
    {
      key: 'project',
      header: t('projects.project'),
      sortKey: 'projectName',
      filter: { field: 'projectName', control: 'text' },
      render: (a) =>
        a.projectName ? (
          <Link to={`/projects/${a.projectId}`} className="text-muted transition-colors hover:text-accent">
            {a.projectName}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'createdDate', header: t('customApps.createdDate'), sortKey: 'createdDate', filter: { field: 'createdDate', control: 'date' }, render: (a) => <span className="text-muted">{formatDateTime(a.createdDate)}</span> },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('nav.customApps') }]}
      title={t('customApps.title')}
      description={t('customApps.desc')}
      actions={
        canWrite || (planLimits && usage) ? (
          <div className="flex items-center gap-4">
            {planLimits && usage && (
              <div
                className="flex flex-col gap-1"
                title={t('customApps.planUsage', { used: usage.totalElements, max: planLimits.maxCustomApps })}
              >
                <span className="text-xs font-medium text-muted">
                  {planLimits.maxCustomApps >= 0
                    ? t('customApps.planUsage', { used: usage.totalElements, max: planLimits.maxCustomApps })
                    : t('customApps.planUsageUnlimited', { used: usage.totalElements })}
                </span>
                {planLimits.maxCustomApps > 0 && (
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-main/10" aria-hidden>
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, (usage.totalElements / planLimits.maxCustomApps) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {canWrite && (
              <Button variant="primary" onClick={() => navigate('/apps/new')}>{t('customApps.new')}</Button>
            )}
          </div>
        ) : undefined
      }
    >
      <DataTable<CustomApp>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(a) => a.id}
        storageKey="customApps"
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={q ? t('customApps.emptyFiltered') : t('customApps.empty')}
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
            placeholder={t('customApps.searchPh')}
            fields={appSearchFields}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        }
        actionsHeader={t('common.actions')}
        actions={(a) => (
          <RowMenu
            ariaLabel={t('common.actions')}
            items={
              canDelete
                ? [{ label: t('common.delete'), onClick: () => setDeleting(a), icon: LuTrash2, danger: true }]
                : []
            }
          />
        )}
      />


      <ConfirmDialog
        open={!!deleting}
        title={t('customApps.deleteTitle')}
        message={t('customApps.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delApp.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delApp.mutateAsync(deleting.id);
            notify.success(t('customApps.deleted'));
            setDeleting(null);
          } catch {
            /* global toast */
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </Page>
  );
}
