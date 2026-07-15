import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  PhoneIncoming,
  PhoneCall,
  PhoneMissed,
  Clock,
  Users,
  UserCheck,
  Timer,
  Gauge,
  Phone,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { Loader } from '@/components/shared/loader';
import { dashboardApi, agentsApi, queuesApi } from '@/api';
import { useLanguage } from '@/hooks/use-language';
import { formatDuration } from '@/lib/utils';

export function DashboardPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: dashboardApi.getDashboardStats });
  const { data: series } = useQuery({ queryKey: ['call-series', range], queryFn: () => dashboardApi.getCallSeries(range) });
  const { data: byDept } = useQuery({ queryKey: ['calls-by-dept'], queryFn: dashboardApi.getCallsByDepartment });
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: queues } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });

  if (!stats) return <Loader />;

  const seriesData = (series ?? []).map((p) => ({ ...p, label: p.label.startsWith('days.') ? t(p.label) : p.label }));

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} icon={<Phone className="h-5 w-5" />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.calls_today')} value={stats.callsToday} icon={PhoneIncoming} tone="primary" />
        <StatCard label={t('dashboard.active_calls')} value={stats.activeCalls} icon={PhoneCall} tone="success" />
        <StatCard label={t('dashboard.answered_calls')} value={stats.answeredCalls} icon={UserCheck} tone="success" />
        <StatCard label={t('dashboard.missed_calls')} value={stats.missedCalls} icon={PhoneMissed} tone="destructive" />
        <StatCard label={t('dashboard.waiting_calls')} value={stats.waitingCalls} icon={Clock} tone="warning" />
        <StatCard label={t('dashboard.online_agents')} value={stats.onlineAgents} icon={Users} tone="success" />
        <StatCard label={t('dashboard.busy_agents')} value={stats.busyAgents} icon={Users} tone="destructive" />
        <StatCard label={t('dashboard.avg_wait')} value={formatDuration(stats.avgWaitTime)} icon={Timer} tone="warning" />
        <StatCard label={t('dashboard.avg_duration')} value={formatDuration(stats.avgCallDuration)} icon={Clock} tone="primary" />
        <StatCard label={t('dashboard.service_level')} value={`${stats.serviceLevel}%`} icon={Gauge} tone="success" />
        <StatCard label={t('dashboard.answer_rate')} value={`${stats.answerRate}%`} icon={Gauge} tone="primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('dashboard.calls_chart')}</CardTitle>
            <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <TabsList>
                <TabsTrigger value="daily">{t('dashboard.daily')}</TabsTrigger>
                <TabsTrigger value="weekly">{t('dashboard.weekly')}</TabsTrigger>
                <TabsTrigger value="monthly">{t('dashboard.monthly')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={seriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cAnswered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cMissed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" width={40} />
                <RTooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="answered" name={t('status.answered')} stroke="#0ea5e9" fill="url(#cAnswered)" strokeWidth={2} />
                <Area type="monotone" dataKey="missed" name={t('status.missed')} stroke="#ef4444" fill="url(#cMissed)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.calls_by_department')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={byDept ?? []}
                  dataKey="value"
                  nameKey={lang === 'ar' ? 'name' : 'nameEn'}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {(byDept ?? []).map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <RTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.queues_overview')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={queues ?? []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="number" tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" width={40} />
                <RTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="stats.answered" name={t('status.answered')} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="stats.abandoned" name={t('status.abandoned')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.agents_status')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(agents ?? []).slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {a.name.split(' ')[0][0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{t('agents.extension')}: {a.extension}</p>
                  </div>
                </div>
                <StatusBadge status={a.status} pulse={a.status === 'online'} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
