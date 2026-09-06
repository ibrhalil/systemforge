import { useState } from 'react';
import { Page } from '../../../../components/Page';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { SelectInput } from '../../../../components/ui/SelectInput';
import { DemoSection } from '../../components/DemoSection';
import type { SelectOption } from '../../../../lib/select';
import {
  LuUsers,
  LuActivity,
  LuServer,
  LuShieldCheck,
  LuArrowUpRight,
  LuArrowDownRight,
  LuRefreshCw,
} from 'react-icons/lu';

const TIMEFRAME_OPTIONS: SelectOption<string>[] = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last Quarter' },
];

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  isPositive: boolean;
  icon: React.ElementType;
  hint: string;
}

function StatCard({ title, value, trend, isPositive, icon: Icon, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-glass bg-surface p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-main">{value}</span>
        <span
          className={`inline-flex items-center text-xs font-semibold ${
            isPositive ? 'text-accent-green' : 'text-danger'
          }`}
        >
          {isPositive ? <LuArrowUpRight className="h-3.5 w-3.5" /> : <LuArrowDownRight className="h-3.5 w-3.5" />}
          {trend}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted/70">{hint}</p>
    </div>
  );
}

function LiveDashboard() {
  const [timeframe, setTimeframe] = useState<SelectOption<string> | null>(TIMEFRAME_OPTIONS[1]);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="rounded-lg border border-glass bg-bg/50 p-6 shadow-sm">
      <Page
        breadcrumb={[{ label: 'Operations' }, { label: 'Platform Dashboard' }]}
        title="Tenant Health & Usage Metrics"
        description="Real-time multi-tenant telemetry, active user connections, and API throughput."
        actions={
          <div className="flex items-center gap-3">
            <div className="w-44">
              <SelectInput
                size="sm"
                options={TIMEFRAME_OPTIONS}
                value={timeframe}
                onChange={(v) => setTimeframe(v as SelectOption<string> | null)}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
              <LuRefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Tenants"
              value="148"
              trend="+8.4%"
              isPositive={true}
              icon={LuServer}
              hint="Isolated PostgreSQL schemas"
            />
            <StatCard
              title="Active User Sessions"
              value="2,410"
              trend="+14.2%"
              isPositive={true}
              icon={LuUsers}
              hint="Redis token store sessions"
            />
            <StatCard
              title="API Request Rate"
              value="1.84M"
              trend="+22.1%"
              isPositive={true}
              icon={LuActivity}
              hint="Avg 32ms latency"
            />
            <StatCard
              title="Failed Auth Attempts"
              value="0.12%"
              trend="-0.4%"
              isPositive={true}
              icon={LuShieldCheck}
              hint="Rate limiter mitigated"
            />
          </div>

          {/* Activity / Progress Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Storage & Plan Usage */}
            <div className="rounded-xl border border-glass bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-glass pb-3">
                <h3 className="text-sm font-semibold text-main">Tenant Quota & Limits</h3>
                <Badge tone="green">Healthy</Badge>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Database Storage (PostgreSQL)', used: '4.2 GB', limit: '20 GB', pct: 21 },
                  { label: 'Custom CustomApp Records', used: '48,120', limit: '100,000', pct: 48 },
                  { label: 'Document Attachments', used: '1.1 GB', limit: '10 GB', pct: 11 },
                ].map((q, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-main font-medium">{q.label}</span>
                      <span className="text-muted font-mono">{q.used} / {q.limit}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-main/10 overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${q.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Real-time System Feed */}
            <div className="lg:col-span-2 rounded-xl border border-glass bg-surface p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-glass pb-3">
                <h3 className="text-sm font-semibold text-main">Cluster Events & Migrations</h3>
                <span className="text-xs text-muted">Auto-refreshed</span>
              </div>

              <div className="space-y-2.5">
                {[
                  { tag: 'FLYWAY_MIGRATION', desc: 'Applied V8_add_app_custom_views to tenant_enterprise_01', time: '4m ago', status: 'green' },
                  { tag: 'REDIS_CACHE_EVICT', desc: 'Permissions invalidated for group iam_billing_team', time: '18m ago', status: 'blue' },
                  { tag: 'SCHEMA_PROVISION', desc: 'Created isolated schema tenant_fintech_emea', time: '1h ago', status: 'accent' },
                  { tag: 'AUDIT_ROTATION', desc: 'Archived 14,000 login audit records to cold store', time: '3h ago', status: 'muted' },
                ].map((ev, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-glass/60 pb-2 last:border-0 last:pb-0 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Badge tone={ev.status as 'green' | 'blue' | 'accent' | 'muted'}>
                        <span className="font-mono text-[10px]">{ev.tag}</span>
                      </Badge>
                      <span className="text-main font-medium">{ev.desc}</span>
                    </div>
                    <span className="text-muted/70 text-[11px] font-mono shrink-0">{ev.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Page>
    </div>
  );
}

const DASHBOARD_CODE = `import { Page } from 'components/Page';
import { Badge } from 'components/ui/Badge';
import { SelectInput } from 'components/ui/SelectInput';

export function DashboardPage() {
  const [timeframe, setTimeframe] = useState(options[0]);

  return (
    <Page
      breadcrumb={[{ label: 'Analytics' }, { label: 'Dashboard' }]}
      title="Platform Dashboard"
      description="Live multi-tenant metrics"
      actions={<SelectInput size="sm" options={timeframeOptions} value={timeframe} onChange={setTimeframe} />}
    >
      {/* 4-column KPI Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tenants" value="148" trend="+8.4%" isPositive />
        <StatCard title="Active Sessions" value="2,410" trend="+14.2%" isPositive />
        <StatCard title="API Requests" value="1.84M" trend="+22.1%" isPositive />
        <StatCard title="Auth Failures" value="0.12%" trend="-0.4%" isPositive />
      </div>

      {/* Progress Bars & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="card p-5">...Quota Progress...</div>
        <div className="lg:col-span-2 card p-5">...Activity Feed...</div>
      </div>
    </Page>
  );
}`;

export function DashboardPatternDemo() {
  return (
    <div className="space-y-10">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent mb-2">
          Dashboard Pattern
        </div>
        <h1 className="text-2xl font-bold text-main">Dashboard & Metric Cards Pattern</h1>
        <p className="mt-1 text-sm text-muted">
          Used for home screens, executive summaries, and analytics overviews.
          Combines KPI statistic tiles with trend percentage indicators, progress quotas, and realtime activity feeds.
        </p>
      </div>

      <DemoSection
        title="Live Interactive Dashboard Page"
        description="Try switching timeframe options or refreshing data to view metric card layouts."
        code={DASHBOARD_CODE}
      >
        <LiveDashboard />
      </DemoSection>
    </div>
  );
}
