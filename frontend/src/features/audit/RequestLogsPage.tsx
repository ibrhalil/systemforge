import { useState } from 'react';
import type { RequestLog } from './types';
import { useRequestLogs } from './hooks';
import { requestLogsApi } from './api';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Page } from '../../components/Page';
import { SearchInput } from '../../components/ui/SearchInput';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';
import { Badge } from '../../components/ui/Badge';
import { Drawer } from '../../components/ui/Drawer';
import { CopyableValue } from '../../components/ui/CopyableValue';
import { JsonBlock } from '../../components/ui/JsonBlock';
import { SavedViewsMenu } from '../../components/ui/SavedViewsMenu';
import { DetailField } from '../../components/detail/DetailPanel';
import { formatDateTime } from '../../lib/format';
import { notify } from '../../lib/notify';
import { saveBlob } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useListPageState } from '../../lib/useListPageState';
import type { SavedViewPrefs } from '../../types';

/**
 * Read-only admin view over {@code t_request_logs} (K-19 layer 3 + K-27).
 * Requires {@code iam:audit:read} — the backend enforces it; the route is guarded by
 * RequirePermission and the sidebar shows the entry only with that authority.
 * The server-side {@code q} search matches the traceId, path, and username.
 */
export function RequestLogsPage() {
  const { t } = useT();
  const {
    page, setPage, pageSize, setPageSize, sort, sorts, toggleSort, applySearchQuery, currentQuery,
    search, setSearch, searchFields, setSearchFields, filters, setFilters, listParams,
  } = useListPageState({ defaultSort: { field: 'createdDate', direction: 'desc' }, storageKey: 'request-logs', syncUrl: true });
  const { data, isLoading, isFetching, error, refetch } = useRequestLogs(listParams);
  const [detail, setDetail] = useState<RequestLog | null>(null);
  // Saved-view prefs channel (K-56 F3): applying a view pushes its column prefs
  // into the table; the nonce makes re-applying the same view work too.
  const [appliedPrefs, setAppliedPrefs] = useState<{ nonce: number; prefs: SavedViewPrefs } | null>(null);

  // Aligned with the backend's searchable registrations (RequestLogQueryService.REQUEST_LOG_FIELDS).
  const requestSearchFields = [
    { key: 'traceId', label: t('requestLog.trace'), searchable: true },
    { key: 'path', label: t('requestLog.path'), searchable: true },
    { key: 'username', label: t('requestLog.user'), searchable: true },
    { key: 'ipAddress', label: t('requestLog.ip'), searchable: true },
    { key: 'userAgent', label: t('requestLog.userAgent'), searchable: true },
    { key: 'method', label: t('requestLog.method'), searchable: false },
    { key: 'status', label: t('requestLog.status'), searchable: false },
    { key: 'durationMs', label: t('requestLog.duration'), searchable: false },
    { key: 'createdDate', label: t('requestLog.date'), searchable: false },
  ];

  const columns: Column<RequestLog>[] = [
    {
      key: 'createdAt',
      header: t('requestLog.date'),
      sortKey: 'createdDate',
      filter: { field: 'createdDate', control: 'date' },
      hideable: false,
      render: (l) => <span className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: 'traceId',
      header: t('requestLog.trace'),
      sortKey: 'traceId',
      filter: { field: 'traceId', control: 'text' },
      render: (l) => <span className="font-mono text-xs text-muted/70">{l.traceId ? l.traceId.slice(0, 8) : '—'}</span>,
    },
    {
      key: 'method',
      header: t('requestLog.method'),
      sortKey: 'method',
      filter: {
        field: 'method',
        control: 'select',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })),
      },
      render: (l) => l.method ? (
        <Badge tone={methodTone(l.method)}>{l.method}</Badge>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
    {
      key: 'path',
      header: t('requestLog.path'),
      sortKey: 'path',
      filter: { field: 'path', control: 'text' },
      render: (l) => <span className="truncate max-w-xs font-mono text-sm">{l.path ?? '—'}</span>,
    },
    {
      key: 'status',
      header: t('requestLog.status'),
      sortKey: 'status',
      filter: { field: 'status', control: 'number' },
      render: (l) => l.status ? (
        <Badge tone={statusTone(l.status)}>{l.status}</Badge>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
    {
      key: 'duration',
      header: t('requestLog.duration'),
      sortKey: 'durationMs',
      filter: { field: 'durationMs', control: 'number' },
      render: (l) => l.durationMs != null ? (
        <span className="whitespace-nowrap text-muted">{l.durationMs} ms</span>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
    {
      key: 'user',
      header: t('requestLog.user'),
      sortKey: 'username',
      filter: { field: 'username', control: 'text' },
      render: (l) => (
        <div className="flex flex-col">
          <span className="text-main">{l.username ?? '—'}</span>
          {l.userId && <span className="text-xs text-muted">{l.userId}</span>}
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: t('requestLog.ip'),
      sortKey: 'ipAddress',
      filter: { field: 'ipAddress', control: 'text' },
      render: (l) => <span className="whitespace-nowrap text-muted">{l.ipAddress ?? '—'}</span>,
    },
    {
      key: 'userAgent',
      header: t('requestLog.userAgent'),
      sortKey: 'userAgent',
      filter: { field: 'userAgent', control: 'text' },
      render: (l) => <span className="truncate max-w-xs text-xs text-muted/70">{l.userAgent ?? '—'}</span>,
    },
  ];

  const onExport = (format: 'csv' | 'excel' | 'pdf') => {
    if (format !== 'csv') {
      notify.info(t('table.comingSoon'));
      return;
    }
    requestLogsApi
      .exportCsv(listParams)
      .then((blob) => saveBlob(blob, `request-logs-${new Date().toISOString().slice(0, 19)}.csv`))
      .catch(() => notify.error(t('requestLog.exportFailed')));
  };

  return (
    <Page
      breadcrumb={[{ label: t('nav.security') }, { label: t('nav.requestLogs') }]}
      title={t('nav.requestLogs')}
      description={t('requestLog.desc')}
    >
      <DataTable<RequestLog>
        columns={columns}
        data={data?.items ?? []}
        rowKey={(l) => l.id}
        storageKey="request-logs"
        onRowClick={setDetail}
        onExport={onExport}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={error && !data ? error : undefined}
        onRetry={() => refetch()}
        emptyMessage={search ? t('requestLog.emptyFiltered') : t('requestLog.empty')}
        page={data?.page ?? page}
        pageSize={data?.size ?? pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        totalElements={data?.totalElements ?? 0}
        totalPages={data?.totalPages ?? 0}
        onPageChange={setPage}
        sort={sort}
        sorts={sorts}
        onSortChange={toggleSort}
        onRefresh={() => refetch()}
        filters={filters}
        onFiltersChange={setFilters}
        appliedPrefs={appliedPrefs}
        toolbar={
          <>
            <SavedViewsMenu
              storageKey="request-logs"
              state={currentQuery}
              onApply={applySearchQuery}
              onApplyPrefs={(prefs) => setAppliedPrefs({ nonce: Date.now(), prefs })}
            />
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('requestLog.searchPh')}
              fields={requestSearchFields}
              selectedFields={searchFields}
              onSelectedFieldsChange={setSearchFields}
            />
          </>
        }
      />

      <Drawer open={!!detail} title={t('requestLog.detail')} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {detail.method && <Badge tone={methodTone(detail.method)}>{detail.method}</Badge>}
              {detail.status != null && <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>}
              {detail.durationMs != null && (
                <span className="text-sm text-muted">{detail.durationMs} ms</span>
              )}
              <span className="text-xs text-muted">{formatDateTime(detail.createdAt)}</span>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label={t('requestLog.trace')}>
                {detail.traceId ? <CopyableValue value={detail.traceId} label={t('requestLog.trace')} /> : null}
              </DetailField>
              <DetailField label={t('requestLog.path')}>
                <span className="break-all font-mono text-xs text-main">{detail.path ?? '—'}</span>
              </DetailField>
              <DetailField label={t('requestLog.user')}>
                <div className="flex flex-col gap-0.5">
                  <span>{detail.username ?? '—'}</span>
                  {detail.userId && (
                    <CopyableValue value={detail.userId} label={t('requestLog.user')} className="text-xs" />
                  )}
                </div>
              </DetailField>
              <DetailField label={t('requestLog.ip')}>
                <span className="font-mono text-xs">{detail.ipAddress ?? '—'}</span>
              </DetailField>
              <div className="sm:col-span-2">
                <DetailField label={t('requestLog.userAgent')}>
                  <span className="break-all text-xs text-muted">{detail.userAgent ?? '—'}</span>
                </DetailField>
              </div>
              <div className="sm:col-span-2">
                <DetailField label={t('requestLog.requestBody')}>
                  {detail.requestBody ? <JsonBlock value={detail.requestBody} /> : null}
                </DetailField>
              </div>
            </dl>
          </div>
        )}
      </Drawer>
    </Page>
  );
}

function methodTone(method: string): 'accent' | 'blue' | 'green' | 'danger' | 'warning' | 'muted' {
  switch (method) {
    case 'GET': return 'blue';
    case 'POST': return 'accent';
    case 'PUT': case 'PATCH': return 'warning';
    case 'DELETE': return 'danger';
    default: return 'muted';
  }
}

function statusTone(status: number): 'accent' | 'blue' | 'green' | 'danger' | 'warning' | 'muted' {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'muted';
  if (status >= 200) return 'green';
  return 'muted';
}