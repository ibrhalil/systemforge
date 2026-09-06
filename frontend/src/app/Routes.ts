import { lazy, type ComponentType } from 'react';
import { PERMISSIONS, type Permission } from '../lib/permissions';

// Route-level code splitting: every shell page is its own chunk, loaded on first
// navigation (AppShell wraps the Outlet in Suspense). Named exports are mapped to
// the default shape lazy() expects.
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('../features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
const TaskDetailPage = lazy(() => import('../features/projects/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const UsersPage = lazy(() => import('../features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() => import('../features/users/UserDetailPage').then((m) => ({ default: m.UserDetailPage })));
const RolesPage = lazy(() => import('../features/roles/RolesPage').then((m) => ({ default: m.RolesPage })));
const RoleDetailPage = lazy(() => import('../features/roles/RoleDetailPage').then((m) => ({ default: m.RoleDetailPage })));
const GroupsPage = lazy(() => import('../features/groups/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const GroupDetailPage = lazy(() => import('../features/groups/GroupDetailPage').then((m) => ({ default: m.GroupDetailPage })));
const PermissionsPage = lazy(() => import('../features/permissions/PermissionsPage').then((m) => ({ default: m.PermissionsPage })));
const PermissionDetailPage = lazy(() => import('../features/permissions/PermissionDetailPage').then((m) => ({ default: m.PermissionDetailPage })));
const ProfilePage = lazy(() => import('../features/users/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const AuditLogsPage = lazy(() => import('../features/audit/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const LoginHistoryPage = lazy(() => import('../features/audit/LoginHistoryPage').then((m) => ({ default: m.LoginHistoryPage })));
const RequestLogsPage = lazy(() => import('../features/audit/RequestLogsPage').then((m) => ({ default: m.RequestLogsPage })));
const SessionsPage = lazy(() => import('../features/sessions/SessionsPage').then((m) => ({ default: m.SessionsPage })));
const AllSessionsPage = lazy(() => import('../features/sessions/AllSessionsPage').then((m) => ({ default: m.AllSessionsPage })));
const UserSessionsPage = lazy(() => import('../features/sessions/UserSessionsPage').then((m) => ({ default: m.UserSessionsPage })));
const ModulesPage = lazy(() => import('../features/modules/ModulesPage').then((m) => ({ default: m.ModulesPage })));
const CustomAppsPage = lazy(() => import('../features/custom-apps/CustomAppsPage').then((m) => ({ default: m.CustomAppsPage })));
const CustomAppDetailPage = lazy(() => import('../features/custom-apps/CustomAppDetailPage').then((m) => ({ default: m.CustomAppDetailPage })));
const RecordPage = lazy(() => import('../features/custom-apps/RecordPage').then((m) => ({ default: m.RecordPage })));
const NotesPage = lazy(() => import('../features/notes/NotesPage').then((m) => ({ default: m.NotesPage })));
const NoteEditorPage = lazy(() => import('../features/notes/NoteEditorPage').then((m) => ({ default: m.NoteEditorPage })));

export interface AppRoute {
  /** Relative path inside the AppShell layout; omit for the index route. */
  path?: string;
  index?: boolean;
  /** Page component — a lazy() chunk is expected for shell routes. */
  Component: ComponentType;
  /** Route renders only with this authority (RequirePermission); omit for
   *  authenticated-only routes (self-service pages). Mirrors Navigation.ts —
   *  the backend enforces the real security regardless. */
  authority?: Permission;
}

/** Routes rendered inside the AppShell layout (children of the `/` route). */
export const SHELL_ROUTES: AppRoute[] = [
  { index: true, Component: ProjectsPage, authority: PERMISSIONS.PROJECT_READ },
  { path: 'projects/new', Component: ProjectDetailPage, authority: PERMISSIONS.PROJECT_WRITE },
  { path: 'projects/:projectId', Component: ProjectDetailPage, authority: PERMISSIONS.PROJECT_READ },
  { path: 'projects/:projectId/tasks/:taskId', Component: TaskDetailPage, authority: PERMISSIONS.TASK_READ },
  { path: 'users', Component: UsersPage, authority: PERMISSIONS.USER_READ },
  { path: 'users/new', Component: UserDetailPage, authority: PERMISSIONS.USER_WRITE },
  { path: 'users/:userId', Component: UserDetailPage, authority: PERMISSIONS.USER_READ },
  { path: 'roles', Component: RolesPage, authority: PERMISSIONS.ROLE_READ },
  { path: 'roles/new', Component: RoleDetailPage, authority: PERMISSIONS.ROLE_WRITE },
  { path: 'roles/:roleId', Component: RoleDetailPage, authority: PERMISSIONS.ROLE_READ },
  { path: 'groups', Component: GroupsPage, authority: PERMISSIONS.GROUP_READ },
  { path: 'groups/new', Component: GroupDetailPage, authority: PERMISSIONS.GROUP_WRITE },
  { path: 'groups/:groupId', Component: GroupDetailPage, authority: PERMISSIONS.GROUP_READ },
  { path: 'permissions', Component: PermissionsPage, authority: PERMISSIONS.PERMISSION_READ },
  { path: 'permissions/new', Component: PermissionDetailPage, authority: PERMISSIONS.PERMISSION_WRITE },
  { path: 'permissions/:permissionId', Component: PermissionDetailPage, authority: PERMISSIONS.PERMISSION_READ },
  { path: 'profile', Component: ProfilePage },
  { path: 'audit-logs', Component: AuditLogsPage, authority: PERMISSIONS.AUDIT_READ },
  { path: 'login-history', Component: LoginHistoryPage, authority: PERMISSIONS.AUDIT_READ },
  { path: 'request-logs', Component: RequestLogsPage, authority: PERMISSIONS.AUDIT_READ },
  { path: 'sessions', Component: SessionsPage },
  { path: 'all-sessions', Component: AllSessionsPage, authority: PERMISSIONS.USER_WRITE },
  { path: 'admin/users/:userId/sessions', Component: UserSessionsPage, authority: PERMISSIONS.USER_WRITE },
  { path: 'modules', Component: ModulesPage, authority: PERMISSIONS.MODULE_READ },
  { path: 'custom-apps', Component: CustomAppsPage, authority: PERMISSIONS.CUSTOM_APP_READ },
  { path: 'apps/new', Component: CustomAppDetailPage, authority: PERMISSIONS.CUSTOM_APP_WRITE },
  { path: 'apps/:customAppId', Component: CustomAppDetailPage, authority: PERMISSIONS.CUSTOM_APP_READ },
  { path: 'apps/:customAppId/records/new', Component: RecordPage, authority: PERMISSIONS.CUSTOM_APP_RECORD_WRITE },
  { path: 'apps/:customAppId/records/:recordId', Component: RecordPage, authority: PERMISSIONS.CUSTOM_APP_RECORD_READ },
  { path: 'notes', Component: NotesPage, authority: PERMISSIONS.NOTE_READ },
  { path: 'notes/new', Component: NoteEditorPage, authority: PERMISSIONS.NOTE_WRITE },
  { path: 'notes/:noteId', Component: NoteEditorPage, authority: PERMISSIONS.NOTE_READ },
];
