import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Search, Users, ListOrdered, PhoneMissed, Clock, PhoneCall, Gauge } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { StatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { reportsApi, agentsApi, queuesApi } from '@/api';
import { useLanguage } from '@/hooks/use-language';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { exportToCsv } from '@/lib/export';

function n(v: unknown) {
  return Number(v || 0) || 0;
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [search, setSearch] = useState('');

  const { data: agentRows = [], isLoading: la } = useQuery({ queryKey: ['report-agents'], queryFn: reportsApi.getAgentPerformance });
  const { data: queueRows = [], isLoading: lq } = useQuery({ queryKey: ['report-queues'], queryFn: reportsApi.getQueuePerformance });
  const { data: peak = [] } = useQuery({ queryKey: ['report-peak'], queryFn: reportsApi.getPeakHoursReport });
  const { data: missed = [] } = useQuery({ queryKey: ['report-missed'], queryFn: reportsApi.getMissedCallsReport });
  const { data: callbacks = [] } = useQuery({ queryKey: ['report-callbacks'], queryFn: reportsApi.getCallbacksReport });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: queues = [] } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });

  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? '—';
  const queueName = (id?: string, number?: string) =>
    queues.find((q) => q.id === id || q.number === number)?.name ?? '—';

  const q = search.trim().toLowerCase();

  const filteredAgents = useMemo(() => {
    if (!q) return agentRows;
    return agentRows.filter((r: any) =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.extension || '').includes(q)
    );
  }, [agentRows, q]);

  const filteredQueues = useMemo(() => {
    if (!q) return queueRows;
    return queueRows.filter((r: any) =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.number || '').includes(q)
    );
  }, [queueRows, q]);

  const filteredMissed = useMemo(() => {
    if (!q) return missed;
    return missed.filter((m: any) =>
      String(m.callerNumber || '').includes(q) ||
      agentName(m.agentId).toLowerCase().includes(q) ||
      String(m.disposition || '').toLowerCase().includes(q)
    );
  }, [missed, q, agents]);

  const filteredCallbacks = useMemo(() => {
    if (!q) return callbacks;
    return callbacks.filter((c: any) =>
      String(c.callerNumber || '').includes(q) ||
      agentName(c.agentId).toLowerCase().includes(q) ||
      String(c.reason || '').toLowerCase().includes(q) ||
      String(c.status || '').toLowerCase().includes(q)
    );
  }, [callbacks, q, agents]);

  const totals = useMemo(() => {
    const callsHandled = agentRows.reduce((s: number, r: any) => s + n(r.callsHandled), 0);
    const callsMissed = agentRows.reduce((s: number, r: any) => s + n(r.callsMissed), 0);
    const answered = queueRows.reduce((s: number, r: any) => s + n(r.answered), 0);
    const abandoned = queueRows.reduce((s: number, r: any) => s + n(r.abandoned), 0);
    const talkTime = agentRows.reduce((s: number, r: any) => s + n(r.totalTalkTime), 0);
    const totalCalls = callsHandled + callsMissed || answered + abandoned;
    const successRate = totalCalls ? Math.round(((callsHandled || answered) / totalCalls) * 100) : 0;

    return {
      agents: agentRows.length,
      queues: queueRows.length,
      callsHandled: callsHandled || answered,
      missed: callsMissed || abandoned,
      successRate,
      talkTime,
    };
  }, [agentRows, queueRows]);

  const loading = la || lq;

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} icon={<BarChart3 className="h-5 w-5" />} />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="الموظفون" value={totals.agents} icon={Users} tone="muted" />
        <StatCard label="الكيوات" value={totals.queues} icon={ListOrdered} tone="muted" />
        <StatCard label="المجابة" value={totals.callsHandled} icon={PhoneCall} tone="success" />
        <StatCard label="الفائتة" value={totals.missed} icon={PhoneMissed} tone="destructive" />
        <StatCard label="نسبة النجاح" value={`${totals.successRate}%`} icon={Gauge} tone="success" />
        <StatCard label="وقت التحدث" value={formatDuration(totals.talkTime)} icon={Clock} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بالموظف، الرقم، الكيو، المتصل، أو الحالة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="agents">
        <TabsList className="flex-wrap">
          <TabsTrigger value="agents">{t('reports.agent_performance')}</TabsTrigger>
          <TabsTrigger value="queues">{t('reports.queue_performance')}</TabsTrigger>
          <TabsTrigger value="peak">{t('reports.peak_hours')}</TabsTrigger>
          <TabsTrigger value="missed">{t('reports.missed_calls')}</TabsTrigger>
          <TabsTrigger value="callbacks">{t('reports.callbacks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('reports.agent_performance')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportToCsv('agent-performance', filteredAgents.map((r: any) => ({ ...r })))}>
                <Download className="h-4 w-4" />{t('common.export_csv')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <Loader /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('agents.extension')}</TableHead>
                      <TableHead>{t('agents.calls_handled')}</TableHead>
                      <TableHead>{t('agents.calls_missed')}</TableHead>
                      <TableHead>{t('agents.avg_handle')}</TableHead>
                      <TableHead>إجمالي التحدث</TableHead>
                      <TableHead>{t('agents.satisfaction')}</TableHead>
                      <TableHead>{t('agents.occupancy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgents.map((r: any) => (
                      <TableRow key={r.agentId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tabular-nums">{r.extension}</TableCell>
                        <TableCell className="tabular-nums text-emerald-600">{n(r.callsHandled)}</TableCell>
                        <TableCell className="tabular-nums text-red-600">{n(r.callsMissed)}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(n(r.avgHandleTime))}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(n(r.totalTalkTime))}</TableCell>
                        <TableCell><Badge variant="outline">{n(r.satisfaction)}%</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{n(r.occupancy)}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queues">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('reports.queue_performance')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportToCsv('queue-performance', filteredQueues.map((r: any) => ({ ...r })))}>
                <Download className="h-4 w-4" />{t('common.export_csv')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <Loader /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('queues.number')}</TableHead>
                      <TableHead>القسم</TableHead>
                      <TableHead>{t('status.answered')}</TableHead>
                      <TableHead>{t('status.abandoned')}</TableHead>
                      <TableHead>{t('queues.avg_wait')}</TableHead>
                      <TableHead>{t('dashboard.service_level')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueues.map((r: any) => (
                      <TableRow key={r.queueId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tabular-nums">{r.number}</TableCell>
                        <TableCell>{queueName(r.queueId, r.number)}</TableCell>
                        <TableCell className="tabular-nums text-emerald-600">{n(r.answered)}</TableCell>
                        <TableCell className="tabular-nums text-red-600">{n(r.abandoned)}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(n(r.avgWait))}</TableCell>
                        <TableCell><Badge variant="outline">{n(r.serviceLevel)}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="peak">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('reports.peak_hours')}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={peak}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <RTooltip />
                  <Bar dataKey="calls" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missed">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('reports.missed_calls')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportToCsv('missed-calls', filteredMissed.map((m: any) => ({ caller: m.callerNumber, agent: agentName(m.agentId), date: formatDateTime(m.startedAt, lang), disposition: m.disposition })))}>
                <Download className="h-4 w-4" />{t('common.export_csv')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('live_calls.caller')}</TableHead>
                    <TableHead>{t('live_calls.agent')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('call_logs.disposition')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMissed.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="tabular-nums">{m.callerNumber}</TableCell>
                      <TableCell>{agentName(m.agentId)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(m.startedAt, lang)}</TableCell>
                      <TableCell><StatusBadge status={m.disposition} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="callbacks">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('reports.callbacks')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('live_calls.caller')}</TableHead>
                    <TableHead>{t('reports.scheduled_for')}</TableHead>
                    <TableHead>{t('live_calls.agent')}</TableHead>
                    <TableHead>{t('common.reason')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCallbacks.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="tabular-nums">{c.callerNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(c.scheduledFor, lang)}</TableCell>
                      <TableCell>{agentName(c.agentId)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{c.reason}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
