import { Suspense, lazy, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LuBuilding2, LuKeyRound, LuLogOut, LuMail, LuScrollText } from 'react-icons/lu';
import { usePlatformAuthStore } from '../../store/platformAuthStore';
import { PLATFORM_PERMISSIONS } from '../../lib/permissions';
import { BreadcrumbTargetContext } from '../../components/BreadcrumbTargetContext';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Spinner } from '../../components/ui/Spinner';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';

// DEV-only (K-56 F1): read-only query cache inspector — tree-shaken from prod builds.
const QueryInspector = import.meta.env.DEV
  ? lazy(() => import('../../components/ui/QueryInspector').then((m) => ({ default: m.QueryInspector })))
  : null;

interface PlatformNavItem {
  to: string;
  labelKey: 'platform.nav.companies' | 'platform.nav.serviceAccounts' | 'platform.nav.auditLogs' | 'platform.nav.mail';
  icon: typeof LuBuilding2;
  authority?: string;
}

const PLATFORM_NAV: PlatformNavItem[] = [
  { to: '/platform/companies', labelKey: 'platform.nav.companies', icon: LuBuilding2, authority: PLATFORM_PERMISSIONS.COMPANY_READ },
  { to: '/platform/service-accounts', labelKey: 'platform.nav.serviceAccounts', icon: LuKeyRound, authority: PLATFORM_PERMISSIONS.SERVICE_ACCOUNT_MANAGE },
  { to: '/platform/audit-logs', labelKey: 'platform.nav.auditLogs', icon: LuScrollText, authority: PLATFORM_PERMISSIONS.AUDIT_READ },
  { to: '/platform/mail', labelKey: 'platform.nav.mail', icon: LuMail, authority: PLATFORM_PERMISSIONS.MAIL_TEST },
];

const navBase = 'flex items-center gap-3 border-l-[3px] px-3 py-2 text-sm font-medium transition-colors';
const navInactive = 'border-transparent text-muted hover:bg-accent/5 hover:text-accent';
// K-54 signature: active nav = left accent rail.
const navActive = 'border-accent bg-accent/10 text-accent';

function navClass({ isActive }: { isActive: boolean }) {
  return cn(navBase, isActive ? navActive : navInactive);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useT();
  const hasAuthority = usePlatformAuthStore((s) => s.hasAuthority);
  return (
    <>
      {PLATFORM_NAV.filter((i) => !i.authority || hasAuthority(i.authority)).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} className={navClass} onClick={onNavigate}>
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {t(item.labelKey)}
          </NavLink>
        );
      })}
    </>
  );
}

/**
 * Platform console shell (K-50 F7): the superadmin's own layout, structurally a
 * slim twin of {@link AppShell} — viewport-locked sidebar + fixed breadcrumb
 * topbar, page body scrolls inside its own container. Renders the tenant shell's
 * breadcrumb portal context so {@link Page} works unchanged. Below lg the nav
 * collapses into a horizontal strip under the topbar.
 */
export function PlatformShell() {
  const { t } = useT();
  const navigate = useNavigate();
  const user = usePlatformAuthStore((s) => s.user);
  const logout = usePlatformAuthStore((s) => s.logout);
  const [breadcrumbTarget, setBreadcrumbTarget] = useState<HTMLDivElement | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/platform/login');
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  };

  const displayName = user?.displayName || user?.email || '—';
  const initial = displayName.charAt(0).toUpperCase();

  const footer = (
    <>
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('nav.language')}</span>
        <LanguageToggle />
      </div>
      <div className="flex items-center gap-2">
        <span
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5"
          title={user?.email ?? ''}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
            {initial}
          </span>
          <span className="min-w-0 flex-col">
            <span className="block truncate text-left text-sm text-main">{displayName}</span>
            <span className="block text-left text-[11px] text-muted">{t('platform.userChip')}</span>
          </span>
        </span>
        <button
          onClick={() => setConfirmingLogout(true)}
          className="shrink-0 rounded-md border border-glass p-2 text-muted transition-colors hover:border-accent/40 hover:text-accent"
          aria-label={t('nav.logout')}
          title={t('nav.logout')}
        >
          <LuLogOut size={16} />
        </button>
      </div>
    </>
  );

  return (
    <BreadcrumbTargetContext.Provider value={breadcrumbTarget}>
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[260px_1fr] lg:overflow-hidden">
        <aside className="relative hidden flex-col bg-sidebar p-5 shadow-xl shadow-black/5 lg:flex lg:border-r lg:border-glass">
          <span aria-hidden className="absolute inset-y-0 left-0 hidden w-1 bg-gradient-to-b from-accent to-accent-blue lg:block" />
          <div className="mb-6 flex items-center gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-blue text-lg font-bold text-white shadow-lg shadow-accent/30">
              SF
            </div>
            <div className="flex min-w-0 flex-col">
              <h2 className="m-0 text-lg font-semibold leading-tight tracking-tight text-main">ForgeSys</h2>
              <span className="text-xs text-muted">{t('platform.console')}</span>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            <NavLinks />
          </nav>
          <div className="mt-3 flex flex-col gap-3 border-t border-glass pt-4">{footer}</div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          <div
            ref={setBreadcrumbTarget}
            className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-glass px-6 lg:px-10"
          >
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted/70 lg:hidden">
              {t('platform.console')}
            </span>
          </div>
          {/* Below lg: horizontal nav strip (the sidebar is desktop-only). */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-glass px-4 py-2 lg:hidden">
            <NavLinks />
          </nav>
          <div className="flex-1 overflow-y-auto p-6 lg:p-10">
            <Suspense
              fallback={(
                <div className="flex items-center justify-center py-16">
                  <Spinner size="lg" className="border-glass border-t-accent" />
                </div>
              )}
            >
              <Outlet />
            </Suspense>
          </div>
        </main>

        <ConfirmDialog
          open={confirmingLogout}
          title={t('nav.logoutConfirmTitle')}
          message={t('nav.logoutConfirmMsg')}
          confirmText={t('nav.logout')}
          cancelText={t('common.cancel')}
          danger
          loading={loggingOut}
          onConfirm={handleLogout}
          onClose={() => setConfirmingLogout(false)}
        />

        {QueryInspector && (
          <Suspense fallback={null}>
            <QueryInspector />
          </Suspense>
        )}
      </div>
    </BreadcrumbTargetContext.Provider>
  );
}
