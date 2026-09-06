import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { LuEllipsisVertical, LuPencil, LuTrash2 } from 'react-icons/lu';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject, useProjectTypeLabels, useTypeOptions, useCreateProject, useUpdateProject, useDeleteProject } from './hooks';
import type { ProjectType } from './types';
import { notify, extractFieldErrors } from '../../lib/notify';
import { useAuthStore } from '../../store/authStore';
import { Badge } from '../../components/ui/Badge';
import { Page } from '../../components/Page';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RowMenu } from '../../components/ui/RowMenu';
import { TextField } from '../../components/ui/Field';
import { TextAreaField } from '../../components/ui/TextArea';
import { SelectInput } from '../../components/ui/SelectInput';
import { DetailPanel } from '../../components/detail/DetailPanel';
import { TaskBoard } from './components/TaskBoard';
import { ProjectNotesPanel } from '../notes/components/ProjectNotesPanel';
import { ProjectCustomAppsPanel } from '../custom-apps/components/ProjectCustomAppsPanel';
import { useT } from '../../lib/i18n';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';

/**
 * Typed project container (K-45): the type decides the body — TASKS renders the task
 * board, NOTES the project's notes, APPS the project's custom app collection. ONE
 * component also serves /projects/new (create) — the users pattern (K-58 CRUD surface
 * rule); editing is an in-page mode with the draft seeded ONCE in startEdit.
 */
export function ProjectDetailPage() {
  const { t } = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const isCreate = !projectId;
  const { data: project, isLoading } = useProject(projectId);
  const typeLabels = useProjectTypeLabels();
  const typeOptions = useTypeOptions();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const navigate = useNavigate();

  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PROJECT_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.PROJECT_DELETE));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Draft state — seeded once per editing session / create mount.
  // No hardcoded type default — the first catalog entry wins once the
  // ACTIVE-module catalog resolves (pm is always active in practice).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProjectType | null>(null);
  const startEdit = () => {
    setFieldErrors({});
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setType(project?.type ?? null);
    setEditing(true);
  };

  const formActive = isCreate || editing;
  const saving = isCreate ? create.isPending : update.isPending;

  const submit = async () => {
    setFieldErrors({});
    if (!type) return;
    try {
      const data = { name, description: description || undefined, type };
      if (isCreate) {
        const created = await create.mutateAsync(data);
        notify.success(t('projects.created'));
        navigate(`/projects/${created.id}`, { replace: true });
      } else {
        await update.mutateAsync({ id: projectId!, data });
        notify.success(t('projects.updated'));
        setEditing(false);
      }
    } catch (e) {
      setFieldErrors(extractFieldErrors(e));
    }
  };

  if (!isCreate && isLoading) {
    return <DetailLoading message={t('projects.loadingProject')} />;
  }
  if (!isCreate && !isLoading && !project) {
    return <DetailNotFound message={t('projects.notFound')} backLabel={t('projects.backToProjects')} backTo="/" />;
  }

  const heading = isCreate ? t('projects.formNew') : (project?.name ?? '');

  return (
    <Page
      breadcrumb={[{ label: t('nav.projects'), to: '/' }, { label: heading }]}
      title={(
        <span className="flex flex-wrap items-center gap-3">
          <span className="truncate">{heading}</span>
          {!isCreate && project && (
            <Badge tone={project.type === 'TASKS' ? 'accent' : project.type === 'NOTES' ? 'blue' : 'green'}>
              {typeLabels[project.type]}
            </Badge>
          )}
        </span>
      )}
      description={!isCreate ? (project?.description ?? undefined) : undefined}
      actions={!formActive && project ? (
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

      {formActive ? (
        <DetailPanel title={t('projects.details')}>
          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            noValidate
          >
            <TextField
              label={t('common.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projects.namePh')}
              error={fieldErrors.name ?? null}
              required
            />
            <SelectInput
              label={t('projects.type')}
              placeholder={t('projects.typePlaceholder')}
              options={typeOptions}
              value={typeOptions.find((o) => o.value === type) ?? null}
              onChange={(next) => setType((next as { value: ProjectType } | null)?.value ?? null)}
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
              onClick={() => { if (isCreate) navigate('/'); else setEditing(false); }}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} disabled={!type}>{t('common.save')}</Button>
          </div>
        </DetailPanel>
      ) : project ? (
        <>
          {project.type === 'TASKS' ? (
            <TaskBoard projectId={project.id} />
          ) : project.type === 'NOTES' ? (
            <ProjectNotesPanel projectId={project.id} />
          ) : project.type === 'APPS' ? (
            <ProjectCustomAppsPanel projectId={project.id} />
          ) : (
            <div className="rounded-lg border border-glass bg-surface px-6 py-16 text-center text-muted">
              {t('projects.comingSoon', { type: typeLabels[project.type] })}
            </div>
          )}
        </>
      ) : null}

      {!isCreate && (
        <ConfirmDialog
          open={deleting}
          title={t('projects.deleteTitle')}
          message={t('projects.deleteMsg', { name: project?.name ?? '' })}
          confirmText={t('common.delete')}
          danger
          loading={del.isPending}
          onConfirm={async () => {
            try {
              await del.mutateAsync(projectId!);
              notify.success(t('projects.deleted'));
              navigate('/');
            } catch { /* global toast */ }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}
