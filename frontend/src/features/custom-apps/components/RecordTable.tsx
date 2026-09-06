import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { RowMenu } from '../../../components/ui/RowMenu';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SelectInput } from '../../../components/ui/SelectInput';
import { INPUT_BASE_SM } from '../../../components/ui/styles';
import { PAGE_SIZE_OPTIONS } from '../../../lib/pagination';
import { formatDateTime } from '../../../lib/format';
import { useT } from '../../../lib/i18n';
import { useListPageState } from '../../../lib/useListPageState';
import { useClientPagination } from '../../../lib/useClientPagination';
import { PERMISSIONS } from '../../../lib/permissions';
import { useAuthStore } from '../../../store/authStore';
import { notify } from '../../../lib/notify';
import type { CustomAppDetail, CustomAppRecord } from '../types';
import { useRecords, usePatchRecord, useDeleteRecord } from '../hooks';
import { cellDisplay, cellEditValue, parseCellInput } from '../cellValue';
import { useValueResolvers } from '../valueLabels';
import { UserPicker } from '../../../components/pickers/UserPicker';
import { RelationPicker } from './RelationPicker';

/** Cell being edited: which record × which property, plus the raw input draft. */
interface EditState {
  recordId: string;
  propertyId: string;
  draft: string;
}

/** Records fed by the parent (RecordsPanel) for client-mode TABLE views. */
export interface ClientRecordsOverride {
  records: CustomAppRecord[];
  isLoading: boolean;
}

/**
 * TABLE view renderer — column = property, row = record. Two data modes:
 * self (default) — own server pagination + section chrome + create/delete dialogs;
 * override (client-mode) — RecordsPanel feeds filtered/sorted records, pagination
 * is local, create/delete live in the panel. All scalar types edit inline on
 * click; USER/RELATION cells edit through their pickers.
 */
export function RecordTable({
  customApp,
  override,
  onRequestDelete,
  onRequestEdit,
}: {
  customApp: CustomAppDetail;
  override?: ClientRecordsOverride;
  /** Delete affordance for override mode (the panel owns the confirm dialog). */
  onRequestDelete?: (record: CustomAppRecord) => void;
  /** Opens the panel-owned record form modal in edit mode (all modes delegate). */
  onRequestEdit?: (record: CustomAppRecord) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const storageKey = `customApp-records-${customApp.id}`;
  const { page, setPage, pageSize, setPageSize, sort, toggleSort, listParams } =
    useListPageState({ defaultSort: { field: 'createdDate', direction: 'desc' }, storageKey });
  // Self-mode server query is disabled while the panel feeds records (override).
  const { data, isLoading, isFetching, error, refetch } = useRecords(override ? undefined : customApp.id, listParams);
  const client = useClientPagination(override?.records ?? [], 10, storageKey);
  const patch = usePatchRecord(customApp.id);
  const delRecord = useDeleteRecord(customApp.id);
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_RECORD_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_RECORD_DELETE));
  // USER labels resolve over the rows actually shown (override: panel-fed; self: server page).
  const resolve = useValueResolvers(customApp, override ? override.records : (data?.items ?? []));

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<CustomAppRecord | null>(null);

  if (customApp.properties.length === 0) {
    // The panel normally guards this; keeps a standalone render meaningful.
    return <EmptyState message={t('customApps.emptyProperties')} />;
  }

  const commit = (record: CustomAppRecord, propertyId: string, raw: string) => {
    const prop = customApp.properties.find((p) => p.id === propertyId)!;
    const parsed = parseCellInput(prop, raw);
    if (parsed === undefined) {
      notify.error(t('customApps.invalidCellInput'));
      return;
    }
    setEdit(null);
    const current = record.values[propertyId] ?? null;
    if (parsed === current) return;
    // Silent failure keeps the table on the old value; the global toast explains.
    patch.mutate({ recordId: record.id, data: { values: { [propertyId]: parsed } } });
  };

  /** Picker commit path (USER/RELATION): the picker hands over a raw id or null. */
  const commitPicker = (record: CustomAppRecord, propertyId: string, value: string | null) => {
    setEdit(null);
    const current = record.values[propertyId] ?? null;
    if ((value ?? null) === (current || null)) return;
    patch.mutate({ recordId: record.id, data: { values: { [propertyId]: value } } });
  };

  const columns: Column<CustomAppRecord>[] = [
    ...customApp.properties.map((prop): Column<CustomAppRecord> => ({
      key: prop.id,
      header: prop.name,
      render: (record) => {
        const editing = edit?.recordId === record.id && edit.propertyId === prop.id;
        if (editing) {
          if (prop.type === 'SELECT') {
            const options = (prop.config?.options ?? []).map((o) => ({ value: o, label: o }));
            return (
              <SelectInput
                options={options}
                value={options.find((o) => o.value === edit.draft) ?? null}
                onChange={(o) => {
                  const value = (o as { value: string } | null)?.value;
                  if (value) commit(record, prop.id, value);
                }}
                isClearable
                size="sm"
                className="min-w-32"
              />
            );
          }
          if (prop.type === 'USER') {
            const raw = record.values[prop.id];
            return (
              <div className="min-w-36">
                <UserPicker
                  value={raw ? String(raw) : null}
                  valueLabel={raw ? resolve(prop, record) : undefined}
                  onChange={(v) => commitPicker(record, prop.id, v)}
                  size="sm"
                />
              </div>
            );
          }
          if (prop.type === 'RELATION') {
            const raw = record.values[prop.id];
            return (
              <div className="min-w-36">
                <RelationPicker
                  property={prop}
                  value={raw ? String(raw) : null}
                  valueLabel={raw ? resolve(prop, record) : undefined}
                  onChange={(v) => commitPicker(record, prop.id, v)}
                  size="sm"
                />
              </div>
            );
          }
          return (
            <input
              autoFocus
              type={prop.type === 'NUMBER' ? 'number' : prop.type === 'DATE' ? 'date' : 'text'}
              value={edit.draft}
              onChange={(e) => setEdit({ ...edit, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(record, prop.id, edit.draft);
                if (e.key === 'Escape') setEdit(null);
              }}
              onBlur={() => commit(record, prop.id, edit.draft)}
              className={`min-w-24 border-accent/60 ${INPUT_BASE_SM}`}
            />
          );
        }
        if (prop.type === 'USER' || prop.type === 'RELATION') {
          const display = resolve(prop, record);
          if (!canWrite) {
            return display ? <span>{display}</span> : <span className="text-muted/50">—</span>;
          }
          return (
            <button
              type="button"
              title={t('common.edit')}
              onClick={() => setEdit({ recordId: record.id, propertyId: prop.id, draft: cellEditValue(prop, record) })}
              className="max-w-48 truncate rounded px-1 text-left text-sm text-main transition-colors hover:bg-accent/10 hover:text-accent"
            >
              {display || <span className="text-muted/50">—</span>}
            </button>
          );
        }
        const display = cellDisplay(prop, record);
        if (!canWrite) {
          return display ? <span>{display}</span> : <span className="text-muted/50">—</span>;
        }
        return (
          <button
            type="button"
            title={t('common.edit')}
            onClick={() => setEdit({ recordId: record.id, propertyId: prop.id, draft: cellEditValue(prop, record) })}
            className="max-w-48 truncate rounded px-1 text-left text-sm text-main transition-colors hover:bg-accent/10 hover:text-accent"
          >
            {display || <span className="text-muted/50">—</span>}
          </button>
        );
      },
    })),
    {
      key: 'createdDate',
      header: t('customApps.createdDate'),
      sortKey: 'createdDate',
      render: (r) => <span className="text-muted">{formatDateTime(r.createdDate)}</span>,
    },
  ];

  const table = (
    <DataTable<CustomAppRecord>
      columns={columns}
      data={override ? client.paged : (data?.items ?? [])}
      rowKey={(r) => r.id}
      storageKey={storageKey}
      loading={override ? override.isLoading : isLoading}
      fetching={!override && isFetching && !isLoading}
      error={!override && error && !data ? error : undefined}
      onRetry={!override ? () => refetch() : undefined}
      emptyMessage={t('customApps.emptyRecords')}
      page={override ? client.page : (data?.page ?? page)}
      pageSize={override ? client.pageSize : (data?.size ?? pageSize)}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageSizeChange={override ? client.setPageSize : setPageSize}
      totalElements={override ? client.totalElements : (data?.totalElements ?? 0)}
      totalPages={override ? client.totalPages : (data?.totalPages ?? 0)}
      onPageChange={override ? client.setPage : setPage}
      // Client-mode rows are already filtered/sorted by the panel — header sort
      // stays bound to the server whitelist only in self mode.
      {...(override ? {} : { sort, onSortChange: toggleSort })}
      actionsHeader={t('common.actions')}
      actions={(r) => (
        <RowMenu
          ariaLabel={t('common.actions')}
          items={[
            ...(canWrite
              ? [{ label: t('common.edit'), onClick: () => onRequestEdit?.(r), icon: LuPencil }]
              : []),
            ...(canDelete
              ? [
                  {
                    label: t('common.delete'),
                    onClick: () => (override ? onRequestDelete?.(r) : setDeleting(r)),
                    icon: LuTrash2,
                    danger: true,
                  },
                ]
              : []),
          ]}
        />
      )}
    />
  );

  // Override mode: the panel owns the section chrome (tabs, description, create,
  // delete dialog) — render the bare table. Self mode carries its own description
  // + create/delete, still inside the panel provided by the parent.
  if (override) return table;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted">{t('customApps.recordsDesc')}</p>
        {canWrite && (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/apps/${customApp.id}/records/new`)}>
            <LuPlus aria-hidden className="h-4 w-4" />
            {t('customApps.newRecord')}
          </Button>
        )}
      </div>
      {table}

      <ConfirmDialog
        open={!!deleting}
        title={t('customApps.deleteRecordTitle')}
        message={t('customApps.deleteRecordMsg')}
        confirmText={t('common.delete')}
        danger
        loading={delRecord.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delRecord.mutateAsync(deleting.id);
            notify.success(t('customApps.recordDeleted'));
            setDeleting(null);
          } catch {
            /* global toast */
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
