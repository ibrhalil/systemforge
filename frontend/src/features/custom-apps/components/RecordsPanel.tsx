import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuEllipsisVertical, LuFilter, LuPlus, LuTrash2 } from 'react-icons/lu';
import { DetailPanel } from '../../../components/detail/DetailPanel';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { RowMenu } from '../../../components/ui/RowMenu';
import { cn } from '../../../lib/cn';
import { useT } from '../../../lib/i18n';
import type { MessageKey } from '../../../lib/i18n';
import { PERMISSIONS } from '../../../lib/permissions';
import { useAuthStore } from '../../../store/authStore';
import { errorMessage, notify } from '../../../lib/notify';
import type { CustomAppDetail, CustomAppRecord, CustomAppValueFilter, CustomAppValueSort, CustomAppView, ViewType } from '../types';
import { useDeleteRecord, useDeleteView, usePlanLimits, useRecords, useUpdateView, useViewRecords } from '../hooks';
import { applyViewQuery } from '../viewQuery';
import { useValueResolvers } from '../valueLabels';
import { ViewModal } from './ViewModal';
import { ViewFilters } from './ViewFilters';
import { RecordTable } from './RecordTable';
import { RecordBoard } from './RecordBoard';
import { RecordCalendar } from './RecordCalendar';
import { RecordList } from './RecordList';
import { RecordGallery } from './RecordGallery';

const VIEW_DESC_KEYS: Record<ViewType, MessageKey> = {
  TABLE: 'customApps.viewDesc.table',
  BOARD: 'customApps.viewDesc.board',
  CALENDAR: 'customApps.viewDesc.calendar',
  LIST: 'customApps.viewDesc.list',
  GALLERY: 'customApps.viewDesc.gallery',
};

/**
 * Records section orchestrator: view tabs (position, then name) + view CRUD +
 * the filter/sort editor + the renderer switch. Data flows through a single
 * bounded fetch (GET /records, first 1000) with filters/sorts applied
 * client-side — except TABLE views without a query, which keep the plain
 * server-paginated RecordTable (and with zero views, the section renders
 * exactly the pre-views behavior).
 */
export function RecordsPanel({ customApp }: { customApp: CustomAppDetail }) {
  const { t } = useT();
  const navigate = useNavigate();
  const canManageViews = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_WRITE));
  const canWriteRecords = useAuthStore((s) => s.hasAuthority(PERMISSIONS.CUSTOM_APP_RECORD_WRITE));

  const views = useMemo(
    () => [...customApp.views].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [customApp.views],
  );
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const activeView = views.find((v) => v.id === activeViewId) ?? views[0] ?? null;

  const [transient, setTransient] = useState<{ filters: CustomAppValueFilter[]; sorts: CustomAppValueSort[] } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewModal, setViewModal] = useState<{ mode: 'new' } | { mode: 'edit'; view: CustomAppView } | null>(null);
  const [deletingView, setDeletingView] = useState<CustomAppView | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CustomAppRecord | null>(null);

  const delView = useDeleteView(customApp.id);
  const delRecord = useDeleteRecord(customApp.id);
  const updateView = useUpdateView(customApp.id);

  // Switching views drops the transient override (it was scoped to the old view).
  const activeId = activeView?.id ?? null;
  useEffect(() => {
    setTransient(null);
    setFiltersOpen(false);
  }, [activeId]);

  const effectiveFilters = transient?.filters ?? activeView?.config?.filters;
  const effectiveSorts = transient?.sorts ?? activeView?.config?.sorts;
  const hasQuery = !!effectiveFilters?.length || !!effectiveSorts?.length;
  // TABLE without a query keeps its own server pagination + section chrome.
  const tableSelfMode = !activeView || (activeView.type === 'TABLE' && !hasQuery);

  const recordsQuery = useViewRecords(tableSelfMode ? undefined : customApp.id);
  // Record usage indicator: totalElements from a one-row probe (uniform across
  // self/client modes — the client-mode page is capped at 1000).
  const { data: recordCount } = useRecords(customApp.id, { page: 0, size: 1 });
  const { data: planLimits } = usePlanLimits();
  const visible = useMemo(
    () => applyViewQuery(recordsQuery.data?.items ?? [], customApp.properties, effectiveFilters, effectiveSorts),
    [recordsQuery.data, customApp.properties, effectiveFilters, effectiveSorts],
  );
  const resolve = useValueResolvers(customApp, visible);
  const fetchedCount = recordsQuery.data?.items.length ?? 0;
  const truncated = !tableSelfMode && (recordsQuery.data?.totalElements ?? 0) > fetchedCount;
  const filterCount = (effectiveFilters?.length ?? 0) + (effectiveSorts?.length ?? 0);

  const saveToView = async (filters: CustomAppValueFilter[], sorts: CustomAppValueSort[]) => {
    if (!activeView) return;
    try {
      await updateView.mutateAsync({
        viewId: activeView.id,
        data: {
          name: activeView.name,
          type: activeView.type,
          config: {
            ...(filters.length ? { filters } : {}),
            ...(sorts.length ? { sorts } : {}),
            ...(activeView.type === 'BOARD' && activeView.config?.groupBy
              ? { groupBy: activeView.config.groupBy }
              : {}),
            ...(activeView.type === 'CALENDAR' && activeView.config?.dateProperty
              ? { dateProperty: activeView.config.dateProperty }
              : {}),
          },
          position: activeView.position,
        },
      });
      notify.success(t('customApps.viewUpdated'));
      setTransient(null);
      setFiltersOpen(false);
    } catch (e) {
      // No inline form here — surface everything, including field-level errors.
      notify.error(errorMessage(e));
    }
  };

  // Record create/edit live on the record page (K-58 CRUD surface rule) — every
  // renderer's onRequestEdit becomes a navigation; create buttons navigate to
  // /apps/:id/records/new. Only the destructive confirm stays here.
  const openRecord = (record: CustomAppRecord) => navigate(`/apps/${customApp.id}/records/${record.id}`);
  const renderer = (() => {
    if (!activeView || (activeView.type === 'TABLE' && !hasQuery)) {
      return <RecordTable customApp={customApp} onRequestEdit={openRecord} />;
    }
    const common = {
      records: visible,
      isLoading: recordsQuery.isLoading,
      resolve,
      onRequestDelete: setDeletingRecord,
      onRequestEdit: openRecord,
    };
    switch (activeView.type) {
      case 'TABLE':
        return (
          <RecordTable
            customApp={customApp}
            override={{ records: visible, isLoading: recordsQuery.isLoading }}
            onRequestDelete={setDeletingRecord}
            onRequestEdit={openRecord}
          />
        );
      case 'BOARD':
        return <RecordBoard customApp={customApp} view={activeView} {...common} />;
      case 'CALENDAR':
        return (
          <RecordCalendar
            customApp={customApp}
            view={activeView}
            records={visible}
            isLoading={recordsQuery.isLoading}
            resolve={resolve}
            onRequestEdit={openRecord}
          />
        );
      case 'LIST':
        return <RecordList customApp={customApp} {...common} />;
      default:
        return <RecordGallery customApp={customApp} {...common} />;
    }
  })();

  // Records are meaningless without properties — the single guard for every mode.
  if (customApp.properties.length === 0) {
    return (
      <DetailPanel title={t('customApps.recordsSection')}>
        <EmptyState message={t('customApps.emptyProperties')} />
      </DetailPanel>
    );
  }

  return (
    <>
      <DetailPanel title={t('customApps.recordsSection')}>
        {!tableSelfMode && activeView && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="m-0 text-sm text-muted">{t(VIEW_DESC_KEYS[activeView.type])}</p>
            {canWriteRecords && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/apps/${customApp.id}/records/new`)}>
                <LuPlus aria-hidden className="h-4 w-4" />
                {t('customApps.newRecord')}
              </Button>
            )}
          </div>
        )}

        {views.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-glass">
            {views.map((v) => {
              const active = v.id === activeView?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveViewId(v.id)}
                  aria-current={active}
                  className={cn(
                    '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'border-accent font-semibold text-accent'
                      : 'border-transparent text-muted hover:text-main',
                  )}
                >
                  {v.name}
                </button>
              );
            })}
            {canManageViews && activeView && (
              <RowMenu
                ariaLabel={t('common.actions')}
                icon={LuEllipsisVertical}
                items={[
                  { label: t('common.edit'), onClick: () => setViewModal({ mode: 'edit', view: activeView }) },
                  { label: t('common.delete'), onClick: () => setDeletingView(activeView), icon: LuTrash2, danger: true },
                ]}
              />
            )}
            {canManageViews && (
              <Button variant="ghost" size="sm" onClick={() => setViewModal({ mode: 'new' })}>
                <LuPlus aria-hidden className="h-4 w-4" />
                {t('customApps.newView')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <LuFilter aria-hidden className="h-4 w-4" />
              {t('customApps.filters')}
              {filterCount > 0 && <Badge tone="accent">{filterCount}</Badge>}
            </Button>
          </div>
        )}

        {filtersOpen && activeView && (
          <div className="mb-4">
            <ViewFilters
              customApp={customApp}
              seedFilters={effectiveFilters ?? []}
              seedSorts={effectiveSorts ?? []}
              canSave={canManageViews}
              saving={updateView.isPending}
              onApply={(filters, sorts) => {
                setTransient({ filters, sorts });
                setFiltersOpen(false);
              }}
              onSaveToView={saveToView}
              onClear={() => {
                setTransient(null);
                setFiltersOpen(false);
              }}
            />
          </div>
        )}

        {renderer}

        {planLimits && (
          <p className="m-0 mt-3 text-xs text-muted/80">
            {planLimits.maxRecordsPerCustomApp >= 0
              ? t('customApps.planRecords', {
                  used: recordCount?.totalElements ?? 0,
                  max: planLimits.maxRecordsPerCustomApp,
                })
              : t('customApps.planRecordsUnlimited', { used: recordCount?.totalElements ?? 0 })}
          </p>
        )}

        {truncated && (
          <p className="m-0 mt-3 text-xs text-muted/80">{t('customApps.truncated', { count: fetchedCount })}</p>
        )}
      </DetailPanel>

      {viewModal && (
        <ViewModal
          customAppId={customApp.id}
          properties={customApp.properties}
          view={viewModal.mode === 'edit' ? viewModal.view : undefined}
          onCreated={(created) => setActiveViewId(created.id)}
          onClose={() => setViewModal(null)}
        />
      )}

      <ConfirmDialog
        open={!!deletingRecord}
        title={t('customApps.deleteRecordTitle')}
        message={t('customApps.deleteRecordMsg')}
        confirmText={t('common.delete')}
        danger
        loading={delRecord.isPending}
        onConfirm={async () => {
          if (!deletingRecord) return;
          try {
            await delRecord.mutateAsync(deletingRecord.id);
            notify.success(t('customApps.recordDeleted'));
            setDeletingRecord(null);
          } catch {
            /* global toast */
          }
        }}
        onClose={() => setDeletingRecord(null)}
      />

      <ConfirmDialog
        open={!!deletingView}
        title={t('customApps.deleteViewTitle')}
        message={t('customApps.deleteViewMsg', { name: deletingView?.name ?? '' })}
        confirmText={t('common.delete')}
        danger
        loading={delView.isPending}
        onConfirm={async () => {
          if (!deletingView) return;
          try {
            await delView.mutateAsync(deletingView.id);
            notify.success(t('customApps.viewDeleted'));
            setDeletingView(null);
          } catch {
            /* global toast */
          }
        }}
        onClose={() => setDeletingView(null)}
      />
    </>
  );
}
