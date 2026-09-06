import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, tasksApi, type ProjectListParams } from './api';
import type { ProjectRequest, ProjectType, TaskRequest } from './types';
import { useT } from '../../lib/i18n';

/** Localized label per project type (badges, selects, placeholders). */
export function useProjectTypeLabels(): Record<ProjectType, string> {
  const { t } = useT();
  return {
    TASKS: t('projects.typeTasks'),
    NOTES: t('projects.typeNotes'),
    APPS: t('projects.typeApps'),
  };
}

// ─── Projects ───
export function useProjects(params: ProjectListParams = {}, enabled = true) {
  return useQuery({ queryKey: ['projects', params], queryFn: () => projectsApi.searchOrList(params), enabled, placeholderData: keepPreviousData });
}

/** Creatable type catalog (ACTIVE modules only) — backs create surfaces + selectors (K-45). */
export function useProjectTypes() {
  return useQuery({ queryKey: ['projects', 'types'], queryFn: () => projectsApi.types() });
}

/**
 * Type options derive from the ACTIVE-module catalog (GET /projects/types, K-45) —
 * a disabled module's type never shows up as creatable. While the catalog loads the
 * list is empty (create waits for it — the backend enforces the gate regardless).
 */
export function useTypeOptions() {
  const typeLabels = useProjectTypeLabels();
  const { data: catalog } = useProjectTypes();
  return (catalog ?? [])
    .filter((c) => typeLabels[c.type])
    .map((c) => ({ value: c.type, label: typeLabels[c.type] }));
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectRequest) => projectsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectRequest }) => projectsApi.update(id, data),
    onSuccess: (project) => qc.invalidateQueries({ queryKey: ['projects'] }).then(() => qc.invalidateQueries({ queryKey: ['projects', project.id] })),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Tasks (nested under a project) ───
export function useTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId as string),
    enabled: !!projectId,
  });
}

export function useTask(projectId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', projectId, taskId],
    queryFn: () => tasksApi.get(projectId as string, taskId as string),
    enabled: !!projectId && !!taskId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: TaskRequest }) =>
      tasksApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, taskId, data }: { projectId: string; taskId: string; data: TaskRequest }) =>
      tasksApi.update(projectId, taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, taskId }: { projectId: string; taskId: string }) =>
      tasksApi.delete(projectId, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
