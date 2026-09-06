import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { LuEllipsisVertical, LuPencil, LuTrash2 } from 'react-icons/lu';
import { useAuthStore } from '../../store/authStore';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePermission, useCreatePermission, useUpdatePermission, useDeletePermission } from './hooks';
import { useRoles } from '../roles/hooks';
import { notify, extractFieldErrors } from '../../lib/notify';
import { Badge } from '../../components/ui/Badge';
import { Page } from '../../components/Page';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RowMenu } from '../../components/ui/RowMenu';
import { TextField } from '../../components/ui/Field';
import { TextAreaField } from '../../components/ui/TextArea';
import { DetailPanel, DetailField } from '../../components/detail/DetailPanel';
import { useT } from '../../lib/i18n';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';

/**
 * ONE component serves /permissions/new (create) and /permissions/:permissionId
 * (view) — the users pattern (K-58 CRUD surface rule). Editing is an in-page
 * mode; the draft is seeded ONCE in startEdit (never from a refetch effect).
 */
export function PermissionDetailPage() {
  const { t } = useT();
  const { permissionId } = useParams<{ permissionId: string }>();
  const isCreate = !permissionId;
  const { data: permission, isLoading } = usePermission(permissionId);
  const { data: rolesData } = useRoles({ size: 200, sort: 'name' });
  const create = useCreatePermission();
  const update = useUpdatePermission();
  const del = useDeletePermission();
  const navigate = useNavigate();

  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PERMISSION_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PERMISSION_DELETE));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Draft state — seeded once per editing session / create mount.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const startEdit = () => {
    setFieldErrors({});
    setName(permission?.name ?? '');
    setDescription(permission?.description ?? '');
    setEditing(true);
  };

  const formActive = isCreate || editing;
  const saving = isCreate ? create.isPending : update.isPending;

  const submit = async () => {
    setFieldErrors({});
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ name, description: description || undefined });
        notify.success(t('permissions.created'));
        navigate(`/permissions/${created.id}`, { replace: true });
      } else {
        await update.mutateAsync({ id: permissionId!, data: { name, description: description || undefined } });
        notify.success(t('permissions.updated'));
        setEditing(false);
      }
    } catch (e) {
      setFieldErrors(extractFieldErrors(e));
    }
  };

  if (!isCreate && isLoading) return <DetailLoading message={t('permissions.loadingPerm')} />;
  if (!isCreate && !isLoading && !permission) {
    return <DetailNotFound message={t('permissions.notFound')} backLabel={t('permissions.backToPerms')} backTo="/permissions" />;
  }

  const heading = isCreate ? t('permissions.formNew') : (permission?.name ?? '');
  const holdingRoles = (rolesData?.items ?? []).filter((r) => r.permissions.some((p) => p.id === permission?.id));

  return (
    <Page
      breadcrumb={[{ label: t('nav.identity') }, { label: t('nav.permissions'), to: '/permissions' }, { label: heading }]}
      title={<span className="font-mono">{heading}</span>}
      actions={!formActive && permission ? (
        <>
          {/* Head pattern: at most one visible action + overflow menu (RowMenu).
              Empty items (no authority) render no trigger. */}
          {canWrite && <Button size="sm" variant="ghost" onClick={startEdit}>
            <LuPencil className="h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailPanel title={t('common.details')}>
          {formActive ? (
            <>
              <form
                className="grid grid-cols-1 gap-4"
                onSubmit={(e) => { e.preventDefault(); void submit(); }}
                noValidate
              >
                <TextField
                  label={t('common.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('permissions.namePh')}
                  required
                  hint={t('permissions.nameHint')}
                  error={fieldErrors.name ?? null}
                />
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
                  onClick={() => { if (isCreate) navigate('/permissions'); else setEditing(false); }}
                  disabled={saving}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={submit} loading={saving}>{t('common.save')}</Button>
              </div>
            </>
          ) : (
            <dl className="grid grid-cols-1 gap-4">
              <DetailField label={t('common.name')}><span className="font-mono">{permission?.name}</span></DetailField>
              <DetailField label={t('common.description')}>{permission?.description}</DetailField>
            </dl>
          )}
        </DetailPanel>

        {!isCreate && (
          <DetailPanel title={t('permissions.assignedTo', { count: holdingRoles.length })}>
            {holdingRoles.length === 0 ? (
              <p className="text-sm text-muted">{t('permissions.noRoles')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {holdingRoles.map((r) => (
                  <Link key={r.id} to={`/roles/${r.id}`}>
                    <Badge tone="accent">{r.name}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </DetailPanel>
        )}
      </div>

      {!isCreate && (
        <ConfirmDialog
          open={deleting}
          title={t('permissions.deleteTitle')}
          message={t('permissions.deleteMsg', { name: permission?.name ?? '' })}
          confirmText={t('common.delete')}
          danger
          loading={del.isPending}
          onConfirm={async () => {
            try {
              await del.mutateAsync(permissionId!);
              notify.success(t('permissions.deleted'));
              navigate('/permissions');
            } catch { /* global toast */ }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}
