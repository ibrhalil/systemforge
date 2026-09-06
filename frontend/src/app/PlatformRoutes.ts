import { lazy, type ComponentType } from 'react';
import { PLATFORM_PERMISSIONS, type PlatformPermission } from '../lib/permissions';

// Route-level code splitting: every platform page is its own chunk (PlatformShell
// wraps the Outlet in Suspense — same contract as the tenant Routes.ts).
const PlatformCompaniesPage = lazy(() => import('../features/platform/PlatformCompaniesPage').then((m) => ({ default: m.PlatformCompaniesPage })));
const PlatformCompanyDetailPage = lazy(() => import('../features/platform/PlatformCompanyDetailPage').then((m) => ({ default: m.PlatformCompanyDetailPage })));
const PlatformServiceAccountsPage = lazy(() => import('../features/platform/PlatformServiceAccountsPage').then((m) => ({ default: m.PlatformServiceAccountsPage })));
const PlatformServiceAccountCreatePage = lazy(() => import('../features/platform/PlatformServiceAccountCreatePage').then((m) => ({ default: m.PlatformServiceAccountCreatePage })));
const PlatformAuditLogsPage = lazy(() => import('../features/platform/PlatformAuditLogsPage').then((m) => ({ default: m.PlatformAuditLogsPage })));
const PlatformMailPage = lazy(() => import('../features/platform/PlatformMailPage').then((m) => ({ default: m.PlatformMailPage })));

export interface PlatformRoute {
  /** Relative path inside the PlatformShell layout. */
  path?: string;
  Component: ComponentType;
  /** Route renders only with this platform permission; omit for authenticated-only. */
  authority?: PlatformPermission;
}

/** Routes rendered inside the PlatformShell layout (children of `/platform`). */
export const PLATFORM_ROUTES: PlatformRoute[] = [
  { path: 'companies', Component: PlatformCompaniesPage, authority: PLATFORM_PERMISSIONS.COMPANY_READ },
  { path: 'companies/:companyId', Component: PlatformCompanyDetailPage, authority: PLATFORM_PERMISSIONS.COMPANY_READ },
  { path: 'service-accounts', Component: PlatformServiceAccountsPage, authority: PLATFORM_PERMISSIONS.SERVICE_ACCOUNT_MANAGE },
  { path: 'service-accounts/new', Component: PlatformServiceAccountCreatePage, authority: PLATFORM_PERMISSIONS.SERVICE_ACCOUNT_MANAGE },
  { path: 'audit-logs', Component: PlatformAuditLogsPage, authority: PLATFORM_PERMISSIONS.AUDIT_READ },
  { path: 'mail', Component: PlatformMailPage, authority: PLATFORM_PERMISSIONS.MAIL_TEST },
];
