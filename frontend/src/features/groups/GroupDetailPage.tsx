import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { LuEllipsisVertical, LuPencil, LuTrash2 } from 'react-icons/lu';
import { useAuthStore } from '../../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useGroup, useGroupEffectivePermissions, useCreateGroup, useUpdateGroup,
  useSetGroupRoles, useSetGroupMembers, useDeleteGroup,
} from './hooks';
import { rolesApi } from '../roles/api';
import { usersApi } from '../users/api';
import { notify, extractFieldErrors } from '../../lib/notify';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RowMenu } from '../../components/ui/RowMenu';
import { TextField } from '../../components/ui/Field';
import { TextAreaField } from '../../components/ui/TextArea';
import { Toggle } from '../../components/ui/Toggle';
import { DetailPanel, DetailField, PermissionBadges } from '../../components/detail/DetailPanel';
import { Page } from '../../components/Page';
import { AssignSection } from '../../components/detail/AssignSection';
import { useT } from '../../lib/i18n';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';

/**
 * ONE component serves /groups/new (create) and /groups/:groupId (view) — the
 * users pattern (K-58 CRUD surface rule). Editing is an in-page mode; the draft
 * is seeded ONCE in startEdit (never from a refetch effect), so background
 * refetches cannot clobber the dirty form mid-edit.
 */
export function GroupDetailPage() {
  const { t } = useT();
  const { groupId } = useParams<{ groupId: string }>();
  const isCreate = !groupId;
  const { data: group, isLoading } = useGroup(groupId);
  const { data: effectivePerms } = useGroupEffectivePermissions(groupId);
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const setRoles = useSetGroupRoles();
  const setMembers = useSetGroupMembers();
  const del = useDeleteGroup();
  const navigate = useNavigate();

  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.GROUP_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.GROUP_DELETE));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Draft state — seeded once per editing session / create mount.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const startEdit = () => {
    setFieldErrors({});
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
    setActive(group?.active ?? true);
    setEditing(true);
  };

  const formActive = isCreate || editing;
  const saving = isCreate ? create.isPending : update.isPending;

  const submit = async () => {
    setFieldErrors({});
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ name, description: description || undefined, active });
        notify.success(t('groups.created'));
        navigate(`/groups/${created.id}`, { replace: true });
      } else {
        await update.mutateAsync({ id: groupId!, data: { name, description: description || undefined, active } });
        notify.success(t('groups.updated'));
        setEditing(false);
      }
    } catch (e) {
      setFieldErrors(extractFieldErrors(e));
    }
  };

  if (!isCreate && isLoading) return <DetailLoading message={t('groups.loadingGroup')} />;
  if (!isCreate && !isLoading && !group) {
    return <DetailNotFound message={t('groups.notFound')} backLabel={t('groups.backToGroups')} backTo="/groups" />;
  }

  const heading = isCreate ? t('groups.formNew') : (group?.name ?? '');

  return (
    <Page
      breadcrumb={[{ label: t('nav.identity') }, { label: t('nav.groups'), to: '/groups' }, { label: heading }]}
      title={(
        <span className="flex flex-wrap items-center gap-3">
          <span className="truncate">{heading}</span>
          {!isCreate && (
            <Badge tone={group?.active ? 'green' : 'muted'}>{group?.active ? t('common.active') : t('common.inactive')}</Badge>
          )}
        </span>
      )}
      description={!isCreate ? (group?.description ?? undefined) : undefined}
      actions={!formActive && group ? (
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
                placeholder={t('groups.namePh')}
                error={fieldErrors.name ?? null}
                required
              />
              <TextAreaField
                label={t('common.descriptionOptional')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                error={fieldErrors.description ?? null}
              />
              <Toggle checked={active} onChange={setActive} label={t('common.activeLbl')} />
            </form>
            <div className="mt-4 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => { if (isCreate) navigate('/groups'); else setEditing(false); }}
                disabled={saving}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={submit} loading={saving}>{t('common.save')}</Button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DetailField label={t('common.name')}>{group?.name}</DetailField>
            <DetailField label={t('common.status')}>{group?.active ? t('common.active') : t('common.inactive')}</DetailField>
            <DetailField label={t('common.members')}>{group?.memberCount}</DetailField>
            <DetailField label={t('common.roles')}>{group?.roles.length}</DetailField>
          </dl>
        )}
      </DetailPanel>

      {!isCreate && group && (
        <>
          {/* Editing surfaces only for iam:group:write holders — a read-only viewer
              sees the current assignments as badges (UserDetailPage pattern). */}
          <div className="grid gap-6 lg:grid-cols-2">
            {canWrite ? (
              <AssignSection
                title={t('common.roles')}
                loadOptions={(input) =>
                  rolesApi
                    .list({ q: input, size: 20, sorts: [{ field: 'name', direction: 'asc' }] })
                    .then((page) => page.items.map((r) => ({ value: r.id, label: r.name })))
                    .catch(() => [])
                }
                selectedOptions={group.roles.map((r) => ({ value: r.id, label: r.name }))}
                selectedValues={group.roles.map((r) => r.id)}
                saving={setRoles.isPending}
                placeholder={t('groups.rolesPh')}
                emptySelectedHint={t('groups.rolesEmpty')}
                successMessage={t('common.rolesUpdated')}
                onSave={async (roleIds) => {
                  await setRoles.mutateAsync({ id: group.id, data: { roleIds } });
                }}
              />
            ) : (
              <DetailPanel title={t('common.roles')}>
                {group.roles.length === 0 ? (
                  <p className="text-sm text-muted">{t('groups.rolesEmpty')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {group.roles.map((r) => (
                      <Badge key={r.id} tone="accent">{r.name}</Badge>
                    ))}
                  </div>
                )}
              </DetailPanel>
            )}

            {canWrite ? (
              <AssignSection
                title={t('groups.membersSection', { count: group.memberCount })}
                loadOptions={(input) =>
                  usersApi
                    .list({ q: input, size: 20, sorts: [{ field: 'email', direction: 'asc' }] })
                    .then((page) => page.items.map((u) => ({ value: u.id, label: u.email })))
                    .catch(() => [])
                }
                selectedOptions={group.members.map((m) => ({ value: m.id, label: m.email }))}
                selectedValues={group.members.map((m) => m.id)}
                saving={setMembers.isPending}
                placeholder={t('groups.membersPh')}
                emptySelectedHint={t('groups.membersEmpty')}
                successMessage={t('groups.membersUpdated')}
                onSave={async (userIds) => {
                  await setMembers.mutateAsync({ id: group.id, data: { userIds } });
                }}
              />
            ) : (
              <DetailPanel title={t('groups.membersSection', { count: group.memberCount })}>
                {group.members.length === 0 ? (
                  <p className="text-sm text-muted">{t('groups.membersEmpty')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {group.members.map((m) => (
                      <Badge key={m.id} tone="blue">{m.email}</Badge>
                    ))}
                  </div>
                )}
              </DetailPanel>
            )}
          </div>

          <DetailPanel title={t('groups.effectivePerms', { count: effectivePerms?.length ?? 0 })}>
            {!effectivePerms ? (
              <p className="text-sm text-muted">{t('common.loading')}</p>
            ) : (
              <PermissionBadges permissions={effectivePerms} />
            )}
          </DetailPanel>
        </>
      )}

      {!isCreate && (
        <ConfirmDialog
          open={deleting}
          title={t('groups.deleteTitle')}
          message={t('groups.deleteMsgDetail', { name: group?.name ?? '' })}
          confirmText={t('common.delete')}
          danger
          loading={del.isPending}
          onConfirm={async () => {
            try { await del.mutateAsync(groupId!); notify.success(t('groups.deleted')); navigate('/groups'); } catch { /* global toast */ }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}

