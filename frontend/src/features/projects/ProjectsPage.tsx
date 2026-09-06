import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Project } from './types';
import { useProjects, useTypeOptions, useDeleteProject } from './hooks';
import { notify } from '../../lib/notify';
import { LuFolderOpen, LuTrash2 } from 'react-icons/lu';
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

export function ProjectsPage() {
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
  } = useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'projects', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = useProjects(listParams);
  const delProject = useDeleteProject();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PROJECT_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PROJECT_DELETE));
  const typeOptions = useTypeOptions();

  const [deleting, setDeleting] = useState<Project | null>(null);

  // Aligned with the backend's searchable registrations (ProjectService.FILTER_FIELDS).
  const projectSearchFields = [
    { key: 'name', label: t('projects.project'), searchable: true },
    { key: 'type', label: t('projects.type'), searchable: false },
    { key: 'description', label: t('common.description'), searchable: true },
    { key: 'parentProjectName', label: t('projects.parentName'), searchable: true },
  ];

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: t('projects.project'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (p) => (
        <Link to={`/projects/${p.id}`} className="font-medium text-main transition-colors hover:text-accent">
          {p.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: t('projects.type'),
      sortKey: 'type',
      filter: { field: 'type', control: 'select', options: typeOptions },
      render: (p) => {
        const label = typeOptions.find((o) => o.value === p.type)?.label ?? p.type;
        const tone = p.type === 'TASKS' ? 'accent' : p.type === 'NOTES' ? 'blue' : 'green';
        return <Badge tone={tone}>{label}</Badge>;
      },
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
      breadcrumb={[{ label: t('nav.projects') }]}
      title={t('projects.title')}
      description={t('projects.desc')}
      actions={canWrite ? <Button variant="primary" onClick={() => navigate('/projects/new')}>{t('projects.new')}</Button> : undefined}
    >

      <DataTable<Project>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(p) => p.id}
        storageKey="projects"
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={q ? t('projects.emptyFiltered') : t('projects.empty')}
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
            placeholder={t('projects.searchPh')}
            fields={projectSearchFields}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        }
        actionsHeader={t('common.actions')}
        actions={(p) => (
          <RowMenu
            ariaLabel={t('common.actions')}
            items={[
              { label: t('projects.open'), onClick: () => navigate(`/projects/${p.id}`), icon: LuFolderOpen },
              ...(canDelete ? [{ label: t('common.delete'), onClick: () => setDeleting(p), icon: LuTrash2, danger: true }] : []),
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('projects.deleteTitle')}
        message={t('projects.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delProject.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delProject.mutateAsync(deleting.id);
            notify.success(t('projects.deleted'));
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
