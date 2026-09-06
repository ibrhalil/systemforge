import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';
import type { ServiceAccount } from './types';
import { useRevokeServiceAccount, useServiceAccounts } from './hooks';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Page } from '../../components/Page';
import { SearchInput } from '../../components/ui/SearchInput';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RowMenu, type RowMenuItem } from '../../components/ui/RowMenu';
import { formatDateTime } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useListPageState } from '../../lib/useListPageState';

/**
 * Service accounts (K-50 F5): API-keyed programmatic identities. The raw key is
 * shown exactly once in a copy modal after creation — the list never carries it.
 */
export function PlatformServiceAccountsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const {
    page, setPage, pageSize, setPageSize, sort, toggleSort,
    search, setSearch, listParams,
  } = useListPageState({ defaultSort: { field: 'createdDate', direction: 'desc' }, storageKey: 'platform-svc' });
  const { data, isLoading, isFetching, error, refetch } = useServiceAccounts(listParams);
  const revoke = useRevokeServiceAccount();

  const [revokeTarget, setRevokeTarget] = useState<ServiceAccount | null>(null);

  const columns: Column<ServiceAccount>[] = [
    {
      key: 'name',
      header: t('platform.svc.name'),
      sortKey: 'name',
      hideable: false,
      render: (a) => <span className="font-medium text-main">{a.name}</span>,
    },
    { key: 'keyPrefix', header: t('platform.svc.keyPrefix'), render: (a) => <span className="font-mono text-sm text-muted">{a.keyPrefix}</span> },
    {
      key: 'scopes',
      header: t('platform.svc.scopes'),
      render: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.scopes.map((s) => (
            <Badge key={s} tone="accent"><span className="font-mono">{s}</span></Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'expiresAt',
      header: t('platform.svc.expiresAt'),
      render: (a) => <span className="whitespace-nowrap text-muted">{a.expiresAt ? formatDateTime(a.expiresAt) : '—'}</span>,
    },
    {
      key: 'lastUsedAt',
      header: t('platform.svc.lastUsedAt'),
      render: (a) => <span className="whitespace-nowrap text-muted">{a.lastUsedAt ? formatDateTime(a.lastUsedAt) : t('platform.svc.never')}</span>,
    },
    {
      key: 'state',
      header: t('common.status'),
      render: (a) =>
        a.revokedAt ? (
          <Badge tone="danger">{t('platform.svc.revoked')}</Badge>
        ) : a.enabled ? (
          <Badge tone="green">{t('platform.status.ACTIVE')}</Badge>
        ) : (
          <Badge tone="muted">{t('platform.status.SUSPENDED')}</Badge>
        ),
    },
  ];

  return (
    <Page
      breadcrumb={[{ label: t('platform.console') }, { label: t('platform.nav.serviceAccounts') }]}
      title={t('platform.nav.serviceAccounts')}
      description={t('platform.svc.desc')}
      actions={
        <Button variant="primary" onClick={() => navigate('/platform/service-accounts/new')}>
          <LuPlus size={16} />
          {t('platform.svc.create')}
        </Button>
      }
    >
      <DataTable<ServiceAccount>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(a) => a.id}
        storageKey="platform-svc"
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={search ? t('platform.companies.emptyFiltered') : t('platform.svc.empty')}
        page={data?.page ?? page}
        pageSize={data?.size ?? pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        totalElements={data?.totalElements ?? 0}
        totalPages={data?.totalPages ?? 0}
        onPageChange={setPage}
        sort={sort}
        onSortChange={toggleSort}
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('platform.svc.searchPh')}
          />
        }
        actions={(a) => {
          if (a.revokedAt) return undefined;
          const items: RowMenuItem[] = [
            { label: t('platform.svc.revoke'), danger: true, onClick: () => setRevokeTarget(a) },
          ];
          return <RowMenu ariaLabel={t('common.actions')} items={items} />;
        }}
        actionsHeader={t('common.actions')}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        title={t('platform.svc.revokeTitle')}
        message={t('platform.svc.revokeConfirm', { name: revokeTarget?.name ?? '' })}
        confirmText={t('platform.svc.revoke')}
        cancelText={t('common.cancel')}
        danger
        loading={revoke.isPending}
        onConfirm={async () => {
          if (revokeTarget) await revoke.mutateAsync(revokeTarget.id);
          setRevokeTarget(null);
        }}
        onClose={() => setRevokeTarget(null)}
      />
    </Page>
  );
}
