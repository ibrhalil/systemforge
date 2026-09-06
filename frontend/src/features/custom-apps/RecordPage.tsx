import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuEllipsisVertical, LuPencil, LuTrash2 } from 'react-icons/lu';
import { Page } from '../../components/Page';
import { DetailPanel, DetailField } from '../../components/detail/DetailPanel';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';
import { Button } from '../../components/ui/Button';
import { RowMenu } from '../../components/ui/RowMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextField } from '../../components/ui/Field';
import { SelectInput } from '../../components/ui/SelectInput';
import { UserPicker } from '../../components/pickers/UserPicker';
import { useT } from '../../lib/i18n';
import { PERMISSIONS } from '../../lib/permissions';
import { useAuthStore } from '../../store/authStore';
import { notify } from '../../lib/notify';
import { cellDisplay, cellEditValue, buildRecordPatch } from './cellValue';
import { useValueResolvers } from './valueLabels';
import { RelationPicker } from './components/RelationPicker';
import {
  useCustomApp, useViewRecords, useCreateRecord, usePatchRecord, useDeleteRecord,
} from './hooks';
import type { CustomAppDetail, CustomAppRecord } from './types';

/** Synthetic empty record — create mode diffs against it (every filled field is a change). */
const EMPTY_VALUES: Record<string, string | number | null> = {};

/**
 * Record page (/apps/:customAppId/records/new + /records/:recordId) — the K-58
 * CRUD surface rule: record create/view/edit is a PAGE (all view renderers
 * navigate here). The record payload comes from the app's bounded records fetch
 * (there is no single-record GET; the fetch mirrors what the views use).
 */
export function RecordPage() {
  const { t } = useT();
  const { customAppId, recordId } = useParams<{ customAppId: string; recordId: string }>();
  const isCreate = !recordId;
  const { data: customApp, isLoading: appLoading } = useCustomApp(customAppId);
  const { data: records, isLoading: recordsLoading } = useViewRecords(isCreate ? undefined : customAppId);
  const record = isCreate ? undefined : (records?.items ?? []).find((r) => r.id === recordId);

  if (appLoading || (!isCreate && recordsLoading)) return <DetailLoading message={t('customApps.loadingRecordPage')} />;
  if (!customApp || customApp.properties.length === 0) {
    return <DetailNotFound message={t('customApps.notFound')} backLabel={t('customApps.backToApps')} backTo="/custom-apps" />;
  }
  if (!isCreate && !record) {
    return <DetailNotFound message={t('customApps.recordNotFound')} backLabel={t('customApps.backToApp')} backTo={`/apps/${customAppId}`} />;
  }

  return <RecordPageInner customApp={customApp} record={record} />;
}

/**
 * One control per property: scalar types get plain inputs, SELECT a dropdown,
 * USER/RELATION their pickers. Create sends only filled fields (required ones
 * must carry a value); edit PATCHes the partial-merge diff: changed keys only,
 * `null` clears a cell, untouched keys are never sent. Required properties
 * cannot be emptied (the backend rejects the clear — blocked client-side).
 */
function RecordPageInner({ customApp, record }: { customApp: CustomAppDetail; record?: CustomAppRecord }) {
  const { id: customAppId } = customApp;
  const { recordId } = useParams<{ recordId: string }>();
  const isCreate = !recordId;
  const navigate = useNavigate();
  const { t } = useT();
  const create = useCreateRecord(customAppId);
  const patch = usePatchRecord(customAppId);
  const del = useDeleteRecord(customAppId);
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_RECORD_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_RECORD_DELETE));
  const resolve = useValueResolvers(customApp, record ? [record] : []);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const startEdit = () => {
    if (!record) return;
    setFieldErrors({});
    setDraft(Object.fromEntries(customApp.properties.map((p) => [p.id, cellEditValue(p, record)])));
    setEditing(true);
  };

  const setValue = (propertyId: string, value: string) => {
    setDraft((prev) => ({ ...prev, [propertyId]: value }));
    setFieldErrors((prev) => ({ ...prev, [propertyId]: '' }));
  };

  const formActive = isCreate || editing;
  const saving = isCreate ? create.isPending : patch.isPending;

  const submit = async () => {
    const errors: Record<string, string> = {};
    const base: CustomAppRecord = record ?? { ...({} as CustomAppRecord), values: EMPTY_VALUES };
    const { invalid, values } = buildRecordPatch(customApp.properties, base, draft);
    for (const id of invalid) errors[id] = t('customApps.invalidCellInput');
    for (const prop of customApp.properties) {
      if (!prop.required || errors[prop.id]) continue;
      const cleared = values[prop.id] === null;
      const missingOnCreate = isCreate && !(prop.id in values);
      if (cleared || missingOnCreate) errors[prop.id] = cleared ? t('customApps.cannotClearRequired') : t('customApps.fieldRequired');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      if (isCreate) {
        const created = await create.mutateAsync({ values: values as Record<string, string | number> });
        notify.success(t('customApps.recordCreated'));
        navigate(`/apps/${customAppId}/records/${created.id}`, { replace: true });
      } else {
        // Empty diff = nothing touched — leave edit mode without a request.
        if (Object.keys(values).length > 0) {
          await patch.mutateAsync({ recordId: recordId!, data: { values } });
          notify.success(t('customApps.recordUpdated'));
        }
        setEditing(false);
      }
    } catch {
      /* global toast */
    }
  };

  const heading = isCreate ? t('customApps.newRecord') : t('customApps.recordHeading');

  return (
    <Page
      breadcrumb={[
        { label: t('nav.customApps'), to: '/custom-apps' },
        { label: customApp.name, to: `/apps/${customAppId}` },
        { label: heading },
      ]}
      title={heading}
      actions={!formActive && record ? (
        <>
          {/* Head pattern: at most one visible action + overflow menu (RowMenu). */}
          {canWrite && (
            <Button variant="ghost" size="sm" onClick={startEdit}>
              <LuPencil aria-hidden className="h-3.5 w-3.5" />
              {t('common.edit')}
            </Button>
          )}
          <RowMenu
            ariaLabel={t('common.actions')}
            icon={LuEllipsisVertical}
            items={
              canDelete
                ? [{ label: t('common.delete'), onClick: () => setDeleting(true), icon: LuTrash2, danger: true }]
                : []
            }
          />
        </>
      ) : undefined}
    >

      <DetailPanel title={t('customApps.recordDetails')}>
        {formActive ? (
          <>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
              noValidate
            >
              {customApp.properties.map((prop) => {
                const label = `${prop.name}${prop.required ? ' *' : ''}`;
                if (prop.type === 'SELECT') {
                  const options = (prop.config?.options ?? []).map((o) => ({ value: o, label: o }));
                  return (
                    <SelectInput
                      key={prop.id}
                      id={`record-${prop.id}`}
                      label={label}
                      options={options}
                      value={options.find((o) => o.value === draft[prop.id]) ?? null}
                      onChange={(o) => setValue(prop.id, (o as { value: string } | null)?.value ?? '')}
                      isClearable
                      error={fieldErrors[prop.id] ?? null}
                    />
                  );
                }
                if (prop.type === 'USER') {
                  const value = draft[prop.id] ?? '';
                  return (
                    <UserPicker
                      key={prop.id}
                      label={label}
                      value={value || null}
                      valueLabel={!isCreate && value ? resolve(prop, record!) || undefined : undefined}
                      onChange={(v) => setValue(prop.id, v ?? '')}
                      error={fieldErrors[prop.id] ?? null}
                    />
                  );
                }
                if (prop.type === 'RELATION') {
                  const value = draft[prop.id] ?? '';
                  return (
                    <RelationPicker
                      key={prop.id}
                      property={prop}
                      label={label}
                      value={value || null}
                      valueLabel={!isCreate && value ? resolve(prop, record!) || undefined : undefined}
                      onChange={(v) => setValue(prop.id, v ?? '')}
                      error={fieldErrors[prop.id] ?? null}
                    />
                  );
                }
                return (
                  <TextField
                    key={prop.id}
                    id={`record-${prop.id}`}
                    label={label}
                    type={prop.type === 'NUMBER' ? 'number' : prop.type === 'DATE' ? 'date' : 'text'}
                    value={draft[prop.id] ?? ''}
                    onChange={(e) => setValue(prop.id, e.target.value)}
                    error={fieldErrors[prop.id] ?? null}
                  />
                );
              })}
            </form>
            <div className="mt-4 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => { if (isCreate) navigate(`/apps/${customAppId}`); else setEditing(false); }}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={submit} loading={saving}>
                {isCreate ? t('common.create') : t('common.save')}
              </Button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {customApp.properties.map((prop) => (
              <DetailField key={prop.id} label={prop.name}>
                {(() => {
                  const display = prop.type === 'USER' || prop.type === 'RELATION'
                    ? resolve(prop, record!)
                    : cellDisplay(prop, record!);
                  return display ? <span>{display}</span> : <span className="text-muted">—</span>;
                })()}
              </DetailField>
            ))}
          </dl>
        )}
      </DetailPanel>

      {!isCreate && (
        <ConfirmDialog
          open={deleting}
          title={t('customApps.deleteRecordTitle')}
          message={t('customApps.deleteRecordMsg')}
          confirmText={t('common.delete')}
          danger
          loading={del.isPending}
          onConfirm={async () => {
            try {
              await del.mutateAsync(recordId!);
              notify.success(t('customApps.recordDeleted'));
              navigate(`/apps/${customAppId}`);
            } catch {
              /* global toast */
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}
