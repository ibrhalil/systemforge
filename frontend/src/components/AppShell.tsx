import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LuChevronDown, LuLogOut, LuMenu } from 'react-icons/lu';
import { useAuthStore } from '../store/authStore';
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from '../app/Navigation';
import { BreadcrumbTargetContext } from './BreadcrumbTargetContext';
import { ImpersonationBanner } from './ImpersonationBanner';
import { LanguageToggle } from './LanguageToggle';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Spinner } from './ui/Spinner';
import { useT } from '../lib/i18n';
import { cn } from '../lib/cn';

// DEV-only (K-56 F1): read-only query cache inspector — tree-shaken from prod builds.
const QueryInspector = import.meta.env.DEV
  ? lazy(() => import('./ui/QueryInspector').then((m) => ({ default: m.QueryInspector })))
  : null;

const navBase =
  'flex items-center gap-3 border-l-[3px] px-3 py-2 text-sm font-medium transition-colors';
const navInactive = 'border-transparent text-muted hover:bg-accent/5 hover:text-accent';
// K-54 signature: active nav = left accent rail (semantic selection indicator).
const navActive = 'border-accent bg-accent/10 text-accent';

function navClass({ isActive }: { isActive: boolean }) {
  return cn(navBase, isActive ? navActive : navInactive);
}

/** One sidebar entry. Visibility is decided by the caller (authority filter). */
function NavEntry({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const { t } = useT();
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.to === '/'} className={navClass} onClick={onClick}>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {t(item.labelKey)}
    </NavLink>
  );
}

/**
 * Collapsible nav group. Header toggles open/closed (chevron rotates); the state is
 * persisted in localStorage per group id so it survives reloads. Items render on a
 * subtle tree guide line.
 */
function NavSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => localStorage.getItem(`sf_nav_${id}`) !== 'closed');

  const toggle = () => {
    setOpen((prev) => {
      localStorage.setItem(`sf_nav_${id}`, prev ? 'closed' : 'open');
      return !prev;
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[13px] font-semibold text-main/80 transition-colors hover:bg-accent/5 hover:text-accent"
      >
        <span>{title}</span>
        <LuChevronDown className={cn('h-4 w-4 text-muted transition-transform', open ? 'rotate-180' : 'rotate-0')} />
      </button>

      {open && (
        <div className="ml-4 flex flex-col gap-1 border-l border-glass/70 pl-2">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The entire sidebar body — logo, authority-filtered nav and the footer (language
 * toggle, user chip, logout). Rendered by BOTH the desktop aside and the mobile
 * drawer so the two surfaces can never drift apart. `onNavigate` (drawer only)
 * closes the drawer after a nav link tap.
 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  // Primitive/action selectors — but `user` (object) stays subscribed on purpose:
  // the nav authority filter must re-run when the session/authorities change.
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasAuthority = useAuthStore((s) => s.hasAuthority);
  const navigate = useNavigate();
  const { t } = useT();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  };

  // /users/me is the single self endpoint (K-37) — authStore.user carries the full
  // profile (username/first/last name) plus the token authorities.
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const displayName = user?.username || fullName || user?.email || '—';
  const initial = displayName.charAt(0).toUpperCase();

  // Authority-driven visibility: a user without the required authority sees neither
  // the item nor the group it lives in (empty groups hide entirely).
  const visibleItems = NAV_ITEMS.filter((i) => !i.authority || hasAuthority(i.authority));

  return (
    <>
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-blue text-lg font-bold text-white shadow-lg shadow-accent/30">
          SF
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 className="m-0 text-lg font-semibold leading-tight tracking-tight text-main">ForgeSys</h2>
          <span className="text-xs text-muted">{t('nav.workspace')}</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavEntry key={item.to} item={item} onClick={onNavigate} />
        ))}

        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.authority || hasAuthority(i.authority));
          if (items.length === 0) return null;
          return (
            <NavSection key={group.id} id={group.id} title={t(group.labelKey)}>
              {items.map((item) => (
                <NavEntry key={item.to} item={item} onClick={onNavigate} />
              ))}
            </NavSection>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-col gap-3 border-t border-glass pt-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('nav.language')}</span>
          <LanguageToggle />
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to="/profile"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-accent/5"
            title={user?.email ?? ''}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
              {initial}
            </span>
            <span className="truncate text-left text-sm text-main">{displayName}</span>
          </NavLink>
          <button
            onClick={() => setConfirmingLogout(true)}
            className="shrink-0 rounded-md border border-glass p-2 text-muted transition-colors hover:border-accent/40 hover:text-accent"
            aria-label={t('nav.logout')}
            title={t('nav.logout')}
          >
            <LuLogOut size={16} />
          </button>
        </div>
      </div>

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
    </>
  );
}

export function AppShell() {
  const { t } = useT();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  // The topbar element Pages portal their breadcrumb into (set once on mount).
  const [breadcrumbTarget, setBreadcrumbTarget] = useState<HTMLDivElement | null>(null);

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Route changes always close the drawer — onNavigate covers link taps, this is
  // the safety net for any other navigation while it is open.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  // Behavior mirrors ui/Modal: Escape closes, body scroll locks while open, focus
  // moves into the panel on open and returns to the opener (hamburger) on close.
  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.focus({ preventScroll: true });
    const opener = hamburgerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      opener?.focus?.({ preventScroll: true });
    };
  }, [drawerOpen]);

  return (
    <BreadcrumbTargetContext.Provider value={breadcrumbTarget}>
      {/* Viewport-locked shell on desktop (sidebar + topbar stay fixed; only the
          page body scrolls inside its own container). Mobile keeps natural page
          scroll — the grid grows and the page scrolls as a whole; the sidebar
          becomes the off-canvas drawer below. */}
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[260px_1fr] lg:overflow-hidden">
        <aside className="relative hidden flex-col bg-sidebar p-5 shadow-xl shadow-black/5 lg:flex lg:border-r lg:border-glass">
          {/* Thin raspberry spine — anchors the sidebar visually. */}
          <span aria-hidden className="absolute inset-y-0 left-0 hidden w-1 bg-gradient-to-b from-accent to-accent-blue lg:block" />

          <SidebarContent />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {/* Impersonation strip (K-50): rendered above the topbar while the
              session is a platform superadmin's tenant switch. */}
          <ImpersonationBanner />
          {/* Fixed breadcrumb topbar (Page portals its breadcrumb here). It lives
              OUTSIDE the scroll container so it never scrolls away — and future
              sticky elements like table headers can use plain `top-0` inside the
              scroll container without offset coordination. The hamburger stays
              before the breadcrumb portal and outside its scroll influence. */}
          <div
            ref={setBreadcrumbTarget}
            className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-glass px-6 lg:px-10"
          >
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={t('nav.menu')}
              className="shrink-0 rounded-md border border-glass p-2 text-muted transition-colors hover:border-accent/40 hover:text-accent lg:hidden"
            >
              <LuMenu size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 lg:p-10">
            {/* Route-level code splitting: pages are lazy chunks (app/Routes.ts); the
                fallback keeps the shell mounted while a chunk loads. */}
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

        {/* Mobile off-canvas nav drawer — same z-50 layer as Modal. */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50">
            <div
              aria-hidden
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              id="mobile-nav-drawer"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.menu')}
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-glass bg-sidebar p-5 shadow-2xl"
            >
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </aside>
          </div>
        )}

        {QueryInspector && (
          <Suspense fallback={null}>
            <QueryInspector />
          </Suspense>
        )}
      </div>
    </BreadcrumbTargetContext.Provider>
  );
}
