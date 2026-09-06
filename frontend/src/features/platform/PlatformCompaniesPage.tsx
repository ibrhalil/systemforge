import type { CompanyStatus } from '../auth/types';
import { Link } from 'react-router-dom';
import type { PlatformCompany } from './types';
import { usePlatformCompanies } from './hooks';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Page } from '../../components/Page';
import { SearchInput } from '../../components/ui/SearchInput';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { Badge } from '../../components/ui/Badge';
import { useT } from '../../lib/i18n';
import { useListPageState } from '../../lib/useListPageState';
import { PLATFORM_PERMISSIONS } from '../../lib/permissions';
import { usePlatformAuthStore } from '../../store/platformAuthStore';

const STATUS_TONE: Record<CompanyStatus, 'green' | 'warning' | 'danger' | 'muted'> = {
  ACTIVE: 'green',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
  PROVISIONING: 'muted',
};

/**
 * Platform companies list (K-50): every tenant company, paged/searched
 * server-side (`platform:company:read` — route-guarded; backend enforces).
 */
export function PlatformCompaniesPage() {
  const { t } = useT();
  const {
    page, setPage, pageSize, setPageSize, sort, toggleSort,
    search, setSearch, searchFields, setSearchFields, filters, setFilters, listParams,
  } = useListPageState({ defaultSort: { field: 'name', direction: 'asc' }, storageKey: 'platform-companies', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = usePlatformCompanies(listParams);
  const hasAuthority = usePlatformAuthStore((s) => s.hasAuthority);
  const canFilterStatus = hasAuthority(PLATFORM_PERMISSIONS.COMPANY_READ);

  // Aligned with the backend's searchable registrations (PlatformCompanyService):
  // q matches name/subdomain.
  const searchFieldOptions = [
    { key: 'name', label: t('common.name'), searchable: true },
    { key: 'subdomain', label: t('platform.companies.subdomain'), searchable: true },
  ];

  const columns: Column<PlatformCompany>[] = [
    {
      key: 'name',
      header: t('common.name'),
      sortKey: 'name',
      filter: { field: 'name', control: 'text' },
      hideable: false,
      render: (c) => <Link to={`/platform/companies/${c.id}`} className="font-medium text-main transition-colors hover:text-accent">{c.name}</Link>,
    },
    {
      key: 'subdomain',
      header: t('platform.companies.subdomain'),
      sortKey: 'subdomain',
      filter: { field: 'subdomain', control: 'text' },
      render: (c) => <span className="font-mono text-sm text-muted">{c.subdomain}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      filter: canFilterStatus
        ? {
            field: 'status',
            control: 'select',
            options: (['ACTIVE', 'SUSPENDED', 'TERMINATED', 'PROVISIONING'] as CompanyStatus[]).map((s) => ({
              value: s,
              label: t(`platform.status.${s}`),
            })),
          }
        : undefined,
      render: (c) => <Badge tone={STATUS_TONE[c.status]}>{t(`platform.status.${c.status}`)}</Badge>,
    },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('platform.console') }, { label: t('platform.nav.companies') }]}
      title={t('platform.nav.companies')}
      description={t('platform.companies.desc')}
    >
      <DataTable<PlatformCompany>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(c) => c.id}
        storageKey="platform-companies"
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={search ? t('platform.companies.emptyFiltered') : t('platform.companies.empty')}
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
            placeholder={t('platform.companies.searchPh')}
            fields={searchFieldOptions}
            selectedFields={searchFields}
            onSelectedFieldsChange={setSearchFields}
          />
        }
        actions={(c) => (
          <Link
            to={`/platform/companies/${c.id}`}
            className="text-sm font-medium text-accent transition-colors hover:text-accent-blue"
          >
            {t('common.view')}
          </Link>
        )}
        actionsHeader={t('common.actions')}
      />
    </Page>
  );
}
