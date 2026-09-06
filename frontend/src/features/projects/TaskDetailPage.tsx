import { PERMISSIONS } from '../../lib/permissions';
import { useState } from 'react';
import { LuEllipsisVertical, LuPencil, LuTrash2 } from 'react-icons/lu';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject, useTask, useUpdateTask, useDeleteTask } from './hooks';
import type { TaskPriority, TaskStatus, TaskRequest } from './types';
import { useUserLabels } from '../users/hooks';
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
import { UserPicker } from '../../components/pickers/UserPicker';
import { DetailPanel, DetailField } from '../../components/detail/DetailPanel';
import { useT } from '../../lib/i18n';
import { DetailLoading, DetailNotFound } from '../../components/detail/DetailFallback';
import type { SelectOption } from '../../lib/select';
import { formatDate } from '../../lib/format';

const PRIORITY_TONE: Record<TaskPriority, 'danger' | 'warning' | 'muted'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'muted',
};

/**
 * Task detail page (/projects/:projectId/tasks/:taskId) — the K-58 CRUD surface
 * rule: viewing and editing a task is a PAGE; the kanban board keeps only the
 * quick-create modal (documented exception). Editing is an in-page mode with the
 * draft seeded ONCE in startEdit (never from a refetch effect).
 */
export function TaskDetailPage() {
  const { t } = useT();
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: task, isLoading: taskLoading } = useTask(projectId, taskId);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const navigate = useNavigate();
  const assigneeLabels = useUserLabels(task?.assigneeId ? [task.assigneeId] : []);

  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.TASK_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.TASK_DELETE));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const statusLabel: Record<TaskStatus, string> = {
    TODO: t('tasks.col.todo'),
    IN_PROGRESS: t('tasks.col.inProgress'),
    DONE: t('tasks.col.done'),
  };
  const statusOptions = (Object.keys(statusLabel) as TaskStatus[]).map(
    (status) => ({ value: status, label: statusLabel[status] }),
  );
  const priorityOptions: SelectOption<TaskPriority>[] = [
    { value: 'LOW', label: t('tasks.priorityLow') },
    { value: 'MEDIUM', label: t('tasks.priorityMedium') },
    { value: 'HIGH', label: t('tasks.priorityHigh') },
  ];
  const priorityLabel: Record<TaskPriority, string> = {
    LOW: t('tasks.priorityLow'),
    MEDIUM: t('tasks.priorityMedium'),
    HIGH: t('tasks.priorityHigh'),
  };

  // Draft state — seeded once per editing session.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const startEdit = () => {
    setFieldErrors({});
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setStatus(task?.status ?? 'TODO');
    setPriority(task?.priority ?? 'MEDIUM');
    setAssigneeId(task?.assigneeId ?? '');
    setDueDate(task?.dueDate ?? '');
    setEditing(true);
  };

  const submit = async () => {
    setFieldErrors({});
    const data: TaskRequest = {
      title,
      description: description || undefined,
      status,
      priority,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined,
    };
    try {
      await update.mutateAsync({ projectId: projectId!, taskId: taskId!, data });
      notify.success(t('tasks.updated'));
      setEditing(false);
    } catch (e) {
      setFieldErrors(extractFieldErrors(e));
    }
  };

  if (taskLoading || projectLoading) return <DetailLoading message={t('tasks.loadingTask')} />;
  if (!task || !project) {
    return <DetailNotFound message={t('tasks.notFound')} backLabel={t('tasks.backToBoard')} backTo={`/projects/${projectId}`} />;
  }

  return (
    <Page
      breadcrumb={[
        { label: t('nav.projects'), to: '/' },
        { label: project.name, to: `/projects/${projectId}` },
        { label: task.title },
      ]}
      title={task.title}
      description={task.description ?? undefined}
      actions={!editing ? (
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

      <DetailPanel title={t('tasks.details')}>
        {editing ? (
          <>
            <form
              className="grid grid-cols-1 gap-4"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
              noValidate
            >
              <TextField
                label={t('tasks.titleField')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('tasks.titlePh')}
                error={fieldErrors.title ?? null}
                required
              />
              <TextAreaField
                label={t('common.descriptionOptional')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                error={fieldErrors.description ?? null}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectInput
                  label={t('common.status')}
                  options={statusOptions}
                  value={statusOptions.find((o) => o.value === status) ?? null}
                  onChange={(next) => setStatus((next as SelectOption<TaskStatus> | null)?.value ?? 'TODO')}
                />
                <SelectInput
                  label={t('tasks.priority')}
                  options={priorityOptions}
                  value={priorityOptions.find((o) => o.value === priority) ?? null}
                  onChange={(next) => setPriority((next as SelectOption<TaskPriority> | null)?.value ?? 'MEDIUM')}
                />
              </div>
              <UserPicker
                label={t('tasks.assignee')}
                isClearable
                value={assigneeId || null}
                valueLabel={assigneeId ? assigneeLabels.get(assigneeId) : undefined}
                onChange={(v) => setAssigneeId(v ?? '')}
                placeholder={t('tasks.unassigned')}
              />
              <TextField
                label={t('tasks.dueDate')}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                error={fieldErrors.dueDate ?? null}
              />
            </form>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={update.isPending}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={submit} loading={update.isPending}>{t('common.save')}</Button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DetailField label={t('common.status')}>
              <Badge tone={task.status === 'DONE' ? 'green' : task.status === 'IN_PROGRESS' ? 'blue' : 'muted'}>
                {statusLabel[task.status]}
              </Badge>
            </DetailField>
            <DetailField label={t('tasks.priority')}>
              <Badge tone={PRIORITY_TONE[task.priority]}>{priorityLabel[task.priority]}</Badge>
            </DetailField>
            <DetailField label={t('tasks.assignee')}>
              {task.assigneeId
                ? (assigneeLabels.get(task.assigneeId)
                  ?? <span className="font-mono text-xs text-muted">{task.assigneeId}</span>)
                : t('tasks.unassigned')}
            </DetailField>
            <DetailField label={t('tasks.dueDateShort')}>
              {task.dueDate ? formatDate(task.dueDate) : '—'}
            </DetailField>
          </dl>
        )}
      </DetailPanel>

      <ConfirmDialog
        open={deleting}
        title={t('tasks.deleteTitle')}
        message={t('tasks.deleteMsg', { title: task.title })}
        confirmText={t('common.delete')}
        danger
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync({ projectId: projectId!, taskId: taskId! });
            notify.success(t('tasks.deleted'));
            navigate(`/projects/${projectId}`);
          } catch { /* global toast */ }
        }}
        onClose={() => setDeleting(false)}
      />
    </Page>
  );
}
