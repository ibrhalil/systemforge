import { PERMISSIONS } from '../../../lib/permissions';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type { Task, TaskPriority, TaskStatus, TaskRequest } from '../types';
import type { PageResult } from '../../../types';
import { useUserLabels } from '../../users/hooks';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '../hooks';
import { notify, extractFieldErrors } from '../../../lib/notify';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { RowMenu } from '../../../components/ui/RowMenu';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { TextField } from '../../../components/ui/Field';
import { TextAreaField } from '../../../components/ui/TextArea';
import { SelectInput } from '../../../components/ui/SelectInput';
import { UserPicker } from '../../../components/pickers/UserPicker';
import { shortenId, formatDate } from '../../../lib/format';
import { LuEllipsisVertical, LuEye, LuTrash2 } from 'react-icons/lu';
import type { SelectOption } from '../../../lib/select';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';
import { columnDropId, resolveDrop, type DropColumn } from '../../../lib/boardDnd';
import { useAuthStore } from '../../../store/authStore';

const COLUMN_TONES: Record<TaskStatus, 'muted' | 'blue' | 'green'> = {
  TODO: 'muted',
  IN_PROGRESS: 'blue',
  DONE: 'green',
};

const DROP_COLUMNS: DropColumn<TaskStatus>[] = (Object.keys(COLUMN_TONES) as TaskStatus[]).map(
  (status) => ({ id: columnDropId(status), value: status }),
);

/** Column + select option labels resolved per-locale at render time. */
function useTaskLabels() {
  const { t } = useT();
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
  return { statusLabel, statusOptions, priorityOptions, priorityLabel };
}

const PRIORITY_TONE: Record<TaskPriority, 'danger' | 'warning' | 'muted'> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'muted',
};

function toRequest(task: Task, overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    title: task.title,
    description: task.description ?? undefined,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? undefined,
    dueDate: task.dueDate ?? undefined,
    ...overrides,
  };
}

/**
 * Three-column task board (TODO/IN_PROGRESS/DONE). Cards are dragged between
 * droppable columns (@dnd-kit) with an optimistic cache write + rollback on
 * error; the per-card status select stays as the keyboard/touch alternative.
 * Tasks are fetched as one list and grouped client-side.
 */
export function TaskBoard({ projectId }: { projectId: string }) {
  const { t } = useT();
  const { statusLabel } = useTaskLabels();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.TASK_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.TASK_DELETE));
  const { data: tasks, isLoading } = useTasks(projectId);
  // Assignee id→email at any scale: shared directory page + per-id detail fallback.
  const assigneeLabels = useUserLabels((tasks?.items ?? []).map((tk) => tk.assigneeId));

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const delTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<Task | null>(null);

  // PointerSensor distance keeps plain clicks (RowMenu, mover) from starting a
  // drag; TouchSensor delay keeps touch scrolling usable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  /**
   * Move a task to another column — one code path for the drag-drop overlay and
   * the card's status select. Optimistic setQueryData + snapshot rollback; the
   * error toast comes from the global mutations.onError.
   */
  const move = (task: Task, status: TaskStatus) => {
    const key = ['tasks', projectId];
    const prev = qc.getQueryData<PageResult<Task>>(key);
    qc.setQueryData<PageResult<Task>>(key, (cur) =>
      cur ? { ...cur, items: cur.items.map((t2) => (t2.id === task.id ? { ...t2, status } : t2)) } : cur,
    );
    updateTask.mutate(
      { projectId, taskId: task.id, data: toRequest(task, { status }) },
      { onError: () => { if (prev) qc.setQueryData(key, prev); } },
    );
  };

  const endDrag = () => {
    setDragging(null);
    document.body.classList.remove('cursor-grabbing');
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-xl font-semibold text-main">{t('tasks.title')}</h2>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}>{t('tasks.new')}</Button>}
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event) => {
          setDragging(tasks?.items.find((tk) => tk.id === String(event.active.id)) ?? null);
          document.body.classList.add('cursor-grabbing');
        }}
        onDragEnd={(event: DragEndEvent) => {
          endDrag();
          const task = tasks?.items.find((tk) => tk.id === String(event.active.id));
          if (!task) return;
          const next = resolveDrop(event.over?.id, task.status, DROP_COLUMNS);
          if (next !== undefined) move(task, next);
        }}
        onDragCancel={endDrag}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(Object.keys(COLUMN_TONES) as TaskStatus[]).map((status) => (
            <TaskColumn
              key={status}
              status={status}
              label={statusLabel[status]}
              colTasks={(tasks?.items ?? []).filter((tk) => tk.status === status)}
              isLoading={isLoading}
              assigneeLabels={assigneeLabels}
              canWrite={canWrite}
              canDelete={canDelete}
              movePending={updateTask.isPending}
              onMove={move}
              onDelete={setDeleting}
            />
          ))}
        </div>

        <DragOverlay>
          {dragging && <TaskDragPreview task={dragging} assigneeLabels={assigneeLabels} />}
        </DragOverlay>
      </DndContext>

      {/* Kanban quick-create — the documented modal exception (K-58); viewing and
          editing a task happen on its page (/projects/:id/tasks/:taskId). */}
      {creating && (
        <QuickCreateTaskModal projectId={projectId} onClose={() => setCreating(false)} />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t('tasks.deleteTitle')}
        message={t('tasks.deleteMsg', { title: deleting?.title ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delTask.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delTask.mutateAsync({ projectId, taskId: deleting.id });
            notify.success(t('tasks.deleted'));
            setDeleting(null);
          } catch {
            /* global toast */
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function TaskColumn({
  status,
  label,
  colTasks,
  isLoading,
  assigneeLabels,
  canWrite,
  canDelete,
  movePending,
  onDelete,
  onMove,
}: {
  status: TaskStatus;
  label: string;
  colTasks: Task[];
  isLoading: boolean;
  assigneeLabels: Map<string, string>;
  canWrite: boolean;
  canDelete: boolean;
  movePending: boolean;
  onDelete: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}) {
  const { t } = useT();
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });

  return (
    <section
      ref={setNodeRef}
      data-droppable-id={columnDropId(status)}
      className={cn(
        'flex min-h-[12rem] flex-col gap-3 rounded-lg border border-glass bg-surface/40 p-3',
        isOver && 'ring-2 ring-accent/40 bg-accent/5',
      )}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Badge tone={COLUMN_TONES[status]}>{label}</Badge>
        </div>
        <span className="text-xs text-muted">{colTasks.length}</span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted">{t('common.loading')}</div>
      ) : colTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-glass px-3 py-6 text-center text-xs text-muted">{t('tasks.noTasks')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {colTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeLabels={assigneeLabels}
              canWrite={canWrite}
              canDelete={canDelete}
              movePending={movePending}
              onDelete={() => onDelete(task)}
              onMove={(status) => onMove(task, status)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  assigneeLabels,
  canWrite,
  canDelete,
  movePending,
  onDelete,
  onMove,
}: {
  task: Task;
  assigneeLabels: Map<string, string>;
  canWrite: boolean;
  canDelete: boolean;
  movePending: boolean;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const { statusOptions, priorityLabel } = useTaskLabels();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !canWrite,
  });

  return (
    <article
      ref={setNodeRef}
      {...(canWrite ? { ...attributes, ...listeners } : {})}
      style={canWrite ? { touchAction: 'manipulation' } : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-glass bg-bg/40 p-3',
        canWrite && !isDragging && 'cursor-grab',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Card title opens the task page — viewing/editing live there (K-58).
            PointerSensor distance keeps plain clicks from starting a drag. */}
        <Link
          to={`/projects/${task.projectId}/tasks/${task.id}`}
          className="font-medium text-main transition-colors hover:text-accent"
        >
          {task.title}
        </Link>
        <Badge tone={PRIORITY_TONE[task.priority]}>{priorityLabel[task.priority]}</Badge>
      </div>
      {task.description && <p className="line-clamp-2 text-xs text-muted">{task.description}</p>}
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">
          {/* Assigned-but-unresolved users show the shortened id — never "unassigned". */}
          {task.assigneeId
            ? assigneeLabels.get(task.assigneeId) ?? shortenId(task.assigneeId)
            : t('tasks.unassigned')}
        </span>
        {task.dueDate && <span className="whitespace-nowrap">{formatDate(task.dueDate)}</span>}
      </div>
      <div className="flex items-center gap-2 border-t border-glass pt-2">
        {/* Keyboard/touch alternative to dragging — same optimistic move path. */}
        {canWrite && (
          <div className="w-36">
            <SelectInput
              size="sm"
              options={statusOptions}
              value={statusOptions.find((o) => o.value === task.status) ?? null}
              onChange={(next) => onMove((next as SelectOption<TaskStatus> | null)?.value ?? task.status)}
              isDisabled={movePending}
            />
          </div>
        )}
        {/* Same action pattern as table rows: destructive actions live only in the overflow. */}
        {(canWrite || canDelete) && (
          <div className="ml-auto">
            <RowMenu
              ariaLabel={t('common.actions')}
              icon={LuEllipsisVertical}
              items={[
                { label: t('common.view'), onClick: () => navigate(`/projects/${task.projectId}/tasks/${task.id}`), icon: LuEye },
                ...(canDelete ? [{ label: t('common.delete'), onClick: onDelete, icon: LuTrash2, danger: true }] : []),
              ]}
            />
          </div>
        )}
      </div>
    </article>
  );
}

/** Simplified clone shown in the DragOverlay — title + summary lines, no action footer. */
function TaskDragPreview({ task, assigneeLabels }: { task: Task; assigneeLabels: Map<string, string> }) {
  const { t } = useT();
  return (
    <article className="flex w-72 rotate-2 flex-col gap-2 rounded-lg border border-glass bg-surface p-3 shadow-2xl">
      <span className="font-medium text-main">{task.title}</span>
      {task.description && <p className="line-clamp-2 m-0 text-xs text-muted">{task.description}</p>}
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">
          {task.assigneeId
            ? assigneeLabels.get(task.assigneeId) ?? shortenId(task.assigneeId)
            : t('tasks.unassigned')}
        </span>
        {task.dueDate && <span className="whitespace-nowrap">{formatDate(task.dueDate)}</span>}
      </div>
    </article>
  );
}

/** Kanban quick-create modal — the documented exception to the page-based CRUD
 *  surface rule (K-58). Editing lives on the task page, never here. */
function QuickCreateTaskModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const { statusOptions, priorityOptions } = useTaskLabels();
  const create = useCreateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      await create.mutateAsync({ projectId, data });
      notify.success(t('tasks.created'));
      onClose();
    } catch (e) {
      setFieldErrors(extractFieldErrors(e));
    }
  };

  return (
    <Modal
      open
      title={t('tasks.newTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label={t('tasks.titleField')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tasks.titlePh')} error={fieldErrors.title ?? null} required />
        <TextAreaField label={t('common.descriptionOptional')} value={description} onChange={(e) => setDescription(e.target.value)} error={fieldErrors.description ?? null} />
        <div className="grid grid-cols-2 gap-3">
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
          onChange={(v) => setAssigneeId(v ?? '')}
          placeholder={t('tasks.unassigned')}
        />
        <TextField label={t('tasks.dueDate')} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={fieldErrors.dueDate ?? null} />
      </div>
    </Modal>
  );
}
