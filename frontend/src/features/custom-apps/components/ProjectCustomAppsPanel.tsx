import { PERMISSIONS } from '../../../lib/permissions';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LuEllipsisVertical, LuPlus, LuTrash2 } from 'react-icons/lu';
import { useCustomApps, useDeleteCustomApp } from '../hooks';
import type { CustomApp } from '../types';
import { Button } from '../../../components/ui/Button';
import { RowMenu } from '../../../components/ui/RowMenu';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useT } from '../../../lib/i18n';
import { useAuthStore } from '../../../store/authStore';
import { notify } from '../../../lib/notify';
import { formatDateTime } from '../../../lib/format';

/**
 * The APPS-type project body (K-45): the container's custom customApp collection (nested
 * list, single bounded page) with a create action anchored to this container. The
 * customApps themselves are managed on their own detail pages.
 */
export function ProjectCustomAppsPanel({ projectId }: { projectId: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { data, isLoading } = useCustomApps({
    projectId,
    page: 0,
    size: 100,
    sorts: [{ field: 'name', direction: 'asc' }],
  });
  const delApp = useDeleteCustomApp();
  const canWrite = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_WRITE));
  const canDelete = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_DELETE));
  const [deleting, setDeleting] = useState<CustomApp | null>(null);
  const customApps = data?.items ?? [];

  return (
    <div className="rounded-lg border border-glass bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-glass px-5 py-3">
        <span className="text-sm font-medium text-main">{t('customApps.inProject')}</span>
        {canWrite && (
          <Button variant="primary" size="sm" onClick={() => navigate(`/apps/new?projectId=${projectId}`)}>
            <LuPlus size={14} />
            {t('customApps.new')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="px-5 py-12 text-center text-muted">{t('common.loading')}</div>
      ) : customApps.length === 0 ? (
        <div className="px-5 py-12 text-center text-muted">{t('customApps.emptyProject')}</div>
      ) : (
        <ul className="divide-y divide-glass">
          {customApps.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <Link
                to={`/apps/${a.id}`}
                className="min-w-0 flex-1 truncate font-medium text-main transition-colors hover:text-accent"
              >
                {a.icon ? `${a.icon} ${a.name}` : a.name}
              </Link>
              <span className="hidden min-w-0 flex-1 truncate text-muted sm:block">{a.description ?? '—'}</span>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(a.createdDate)}</span>
              {/* Destructive overflow pattern (RecordGallery): delete lives in the menu. */}
              <RowMenu
                ariaLabel={t('common.actions')}
                icon={LuEllipsisVertical}
                items={
                  canDelete
                    ? [{ label: t('common.delete'), onClick: () => setDeleting(a), icon: LuTrash2, danger: true }]
                    : []
                }
              />
            </li>
          ))}
        </ul>
      )}


      <ConfirmDialog
        open={!!deleting}
        title={t('customApps.deleteTitle')}
        message={t('customApps.deleteMsg', { name: deleting?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delApp.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await delApp.mutateAsync(deleting.id);
            notify.success(t('customApps.deleted'));
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
