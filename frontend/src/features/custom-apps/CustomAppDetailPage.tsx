import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LuEllipsisVertical, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { Page } from '../../components/Page';
import { DetailPanel, DetailField } from '../../components/detail/DetailPanel';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { RowMenu } from '../../components/ui/RowMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextField } from '../../components/ui/Field';
import { TextAreaField } from '../../components/ui/TextArea';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { PERMISSIONS } from '../../lib/permissions';
import { useAuthStore } from '../../store/authStore';
import { notify, extractFieldErrors } from '../../lib/notify';
import type { CustomAppProperty } from './types';
import { useCustomApp, useCreateCustomApp, useUpdateCustomApp, useDeleteCustomApp, useDeleteProperty } from './hooks';
import { PropertyModal } from './components/PropertyModal';
import { RecordsPanel } from './components/RecordsPanel';

/** Emoji shortlist — deliberately tiny; no icon library or upload pipeline. */
const APP_ICONS = [
  '📦', '📋', '🧾', '📊', '📈', '🗂️', '🛒', '🚚', '💰', '👥',
  '🏗️', '🧪', '🎯', '📅', '💡', '🔧', '📣', '🌱', '⚡', '🎓',
];

/**
 * ONE component serves /apps/new (create) and /apps/:customAppId (view) — the
 * users pattern (K-58 CRUD surface rule). Editing is an in-page mode; the draft
 * is seeded ONCE in startEdit (never from a refetch effect). Property/View
 * config modals stay (documented rare-config exception).
 */
export function CustomAppDetailPage() {
  const { customAppId } = useParams<{ customAppId: string }>();
  const isCreate = !customAppId;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  const { data: customApp, isLoading } = useCustomApp(customAppId);
  const create = useCreateCustomApp();
  const update = useUpdateCustomApp();
  const delApp = useDeleteCustomApp();
  const delProperty = useDeleteProperty(customAppId!);
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_DELETE));

  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deletingApp, setDeletingApp] = useState(false);
  const [propertyModal, setPropertyModal] = useState<{ mode: 'new' } | { mode: 'edit'; property: CustomAppProperty } | null>(null);
  const [deletingProperty, setDeletingProperty] = useState<CustomAppProperty | null>(null);

  // Draft state — seeded once per editing session / create mount. Create reads
  // ?projectId= to anchor the app to an APPS container (project panel entry).
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const startEdit = () => {
    setName(customApp?.name ?? '');
    setIcon(customApp?.icon ?? '');
    setDescription(customApp?.description ?? '');
    setEditing(true);
  };

  const formActive = isCreate || editing;
  const saving = isCreate ? create.isPending : update.isPending;

  const submit = async () => {
    try {
      if (isCreate) {
        // ?projectId= anchors the new app to an APPS container (project panel entry).
        const created = await create.mutateAsync({
          name,
          description: description || undefined,
          icon: icon || undefined,
          projectId: searchParams.get('projectId') ?? undefined,
        });
        notify.success(t('customApps.created'));
        navigate(`/apps/${created.id}`, { replace: true });
      } else {
        // Full PUT — the backend overwrites icon unconditionally, so an emptied
        // picker must be sent as an explicit null rather than omitted.
        await update.mutateAsync({ id: customAppId!, data: { name, description: description || undefined, icon: icon || null } });
        notify.success(t('customApps.updated'));
        setEditing(false);
      }
    } catch (e) {
      // Field-level errors land inline; the rest goes to the global toast.
      const errors = extractFieldErrors(e);
      if (Object.keys(errors).length) setFieldErrors(errors);
    }
  };

  if (!isCreate && isLoading) return <DetailLoading message={t('customApps.loadingApp')} />;
  // Shape guard: a truthy but non-detail payload (summary/error shape) must not
  // reach the view render — `customApp.properties` access would crash the page.
  if (!isCreate && !isLoading && (!customApp || !Array.isArray(customApp.properties))) {
    return <DetailNotFound message={t('customApps.notFound')} backLabel={t('customApps.backToApps')} backTo="/custom-apps" />;
  }

  const heading = isCreate ? t('customApps.formNew') : (customApp?.icon ? `${customApp.icon} ${customApp.name}` : (customApp?.name ?? ''));

  return (
    <Page
      breadcrumb={[{ label: t('nav.customApps'), to: '/custom-apps' }, { label: isCreate ? t('customApps.formNew') : (customApp?.name ?? '') }]}
      title={heading}
      description={!isCreate ? (customApp?.description ?? undefined) : undefined}
      actions={!formActive && customApp ? (
        <>
          {canWrite && (
            <Button variant="ghost" size="sm" onClick={startEdit}>
              <LuPencil aria-hidden className="h-4 w-4" />
              {t('common.edit')}
            </Button>
          )}
          <RowMenu
            ariaLabel={t('common.actions')}
            icon={LuEllipsisVertical}
            items={
              canDelete
                ? [{ label: t('common.delete'), onClick: () => setDeletingApp(true), icon: LuTrash2, danger: true }]
                : []
            }
          />
        </>
      ) : undefined}
    >
      <div className="flex flex-col gap-6">
        <DetailPanel title={t('common.details')}>
          {formActive ? (
            <>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => { e.preventDefault(); void submit(); }}
                noValidate
              >
                <TextField
                  id="customApp-name"
                  label={t('common.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('customApps.namePh')}
                  error={fieldErrors.name ?? null}
                  required
                />
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">{t('customApps.iconLabel')}</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={t('customApps.iconLabel')}>
                    <button
                      type="button"
                      aria-pressed={icon === ''}
                      aria-label={t('customApps.iconNone')}
                      title={t('customApps.iconNone')}
                      onClick={() => setIcon('')}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-md border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                        icon === '' ? 'border-accent bg-accent/10 text-accent' : 'border-glass text-muted hover:bg-main/5',
                      )}
                    >
                      —
                    </button>
                    {APP_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-pressed={icon === emoji}
                        aria-label={emoji}
                        onClick={() => setIcon(emoji)}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                          icon === emoji ? 'border-accent bg-accent/10' : 'border-glass hover:bg-main/5',
                        )}
                      >
                        <span aria-hidden>{emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <TextAreaField
                  label={t('common.descriptionOptional')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  error={fieldErrors.description ?? null}
                />
              </form>
              <div className="mt-4 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => { if (isCreate) navigate('/custom-apps'); else setEditing(false); }}
                  disabled={saving}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={submit} loading={saving}>
                  {t('common.save')}
                </Button>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailField label={t('common.name')}>{customApp?.name}</DetailField>
              <DetailField label={t('common.description')}>{customApp?.description ?? <span className="text-muted">—</span>}</DetailField>
              <DetailField label={t('customApps.createdDate')}>{customApp ? formatDateTime(customApp.createdDate) : ''}</DetailField>
            </div>
          )}
        </DetailPanel>

        {!isCreate && customApp && (
          <>
            <DetailPanel title={t('customApps.propertiesSection')}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="m-0 text-sm text-muted">{t('customApps.propertiesDesc')}</p>
                {canWrite && (
                  <Button variant="ghost" size="sm" onClick={() => setPropertyModal({ mode: 'new' })}>
                    <LuPlus aria-hidden className="h-4 w-4" />
                    {t('customApps.addProperty')}
                  </Button>
                )}
              </div>
              {customApp.properties.length === 0 ? (
                <EmptyState message={t('customApps.emptyProperties')} />
              ) : (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {customApp.properties.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-md border border-glass px-3 py-2 transition-colors hover:bg-main/5"
                    >
                      <span className="max-w-56 min-w-0 truncate text-sm font-medium text-main">{p.name}</span>
                      <Badge tone="blue">{t(`customApps.type.${p.type}`)}</Badge>
                      {p.required && <Badge tone="accent">{t('customApps.requiredBadge')}</Badge>}
                      <span className="text-xs text-muted/70">#{p.position}</span>
                      {canWrite && (
                        <RowMenu
                          ariaLabel={t('common.actions')}
                          items={[
                            { label: t('common.edit'), onClick: () => setPropertyModal({ mode: 'edit', property: p }) },
                            { label: t('common.delete'), onClick: () => setDeletingProperty(p), icon: LuTrash2, danger: true },
                          ]}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DetailPanel>

            <RecordsPanel customApp={customApp} />
          </>
        )}
      </div>

      {!isCreate && customApp && propertyModal && (
        <PropertyModal customAppId={customApp.id} property={propertyModal.mode === 'edit' ? propertyModal.property : undefined} onClose={() => setPropertyModal(null)} />
      )}

      {!isCreate && (
        <ConfirmDialog
          open={deletingProperty !== null}
          title={t('customApps.deletePropertyTitle')}
          message={t('customApps.deletePropertyMsg', { name: deletingProperty?.name ?? '' })}
          confirmText={t('common.delete')}
          danger
          loading={delProperty.isPending}
          onConfirm={async () => {
            if (!deletingProperty) return;
            try {
              await delProperty.mutateAsync(deletingProperty.id);
              notify.success(t('customApps.propertyDeleted'));
              setDeletingProperty(null);
            } catch {
              /* global toast */
            }
          }}
          onClose={() => setDeletingProperty(null)}
        />
      )}

      {!isCreate && (
        <ConfirmDialog
          open={deletingApp}
          title={t('customApps.deleteTitle')}
          message={t('customApps.deleteMsg', { name: customApp?.name ?? '' })}
          confirmText={t('common.delete')}
          danger
          loading={delApp.isPending}
          onConfirm={async () => {
            try {
              await delApp.mutateAsync(customAppId!);
              notify.success(t('customApps.deleted'));
              navigate('/custom-apps');
            } catch {
              /* global toast */
            }
          }}
          onClose={() => setDeletingApp(false)}
        />
      )}
    </Page>
  );
}
