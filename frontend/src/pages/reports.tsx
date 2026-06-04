import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { reportsApi, agentsApi } from '@/api';
import { useLanguage } from '@/hooks/use-language';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { exportToCsv } from '@/lib/export';

export function ReportsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const { data: agentRows, isLoading: la } = useQuery({ queryKey: ['report-agents'], queryFn: reportsApi.getAgentPerformance });
  const { data: queueRows, isLoading: lq } = useQuery({ queryKey: ['report-queues'], queryFn: reportsApi.getQueuePerformance });
  const { data: peak } = useQuery({ queryKey: ['report-peak'], queryFn: reportsApi.getPeakHoursReport });
  const { data: missed } = useQuery({ queryKey: ['report-missed'], queryFn: reportsApi.getMissedCallsReport });
  const { data: callbacks } = useQuery({ queryKey: ['report-callbacks'], queryFn: reportsApi.getCallbacksReport });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });

  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} icon={<BarChart3 className="h-5 w-5" />} />

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
              <Button variant="outline" size="sm" onClick={() => agentRows && exportToCsv('agent-performance', agentRows.map((r) => ({ ...r })))}><Download className="h-4 w-4" />{t('common.export_csv')}</Button>
            </CardHeader>
            <CardContent className="p-0">
              {la ? <Loader /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('agents.extension')}</TableHead>
                      <TableHead>{t('agents.calls_handled')}</TableHead>
                      <TableHead>{t('agents.calls_missed')}</TableHead>
                      <TableHead>{t('agents.avg_handle')}</TableHead>
                      <TableHead>{t('agents.satisfaction')}</TableHead>
                      <TableHead>{t('agents.occupancy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(agentRows ?? []).map((r) => (
                      <TableRow key={r.agentId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tabular-nums">{r.extension}</TableCell>
                        <TableCell className="tabular-nums">{r.callsHandled}</TableCell>
                        <TableCell className="tabular-nums">{r.callsMissed}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(r.avgHandleTime)}</TableCell>
                        <TableCell className="tabular-nums">{r.satisfaction}%</TableCell>
                        <TableCell className="tabular-nums">{r.occupancy}%</TableCell>
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
              <Button variant="outline" size="sm" onClick={() => queueRows && exportToCsv('queue-performance', queueRows.map((r) => ({ ...r })))}><Download className="h-4 w-4" />{t('common.export_csv')}</Button>
            </CardHeader>
            <CardContent className="p-0">
              {lq ? <Loader /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('queues.number')}</TableHead>
                      <TableHead>{t('status.answered')}</TableHead>
                      <TableHead>{t('status.abandoned')}</TableHead>
                      <TableHead>{t('queues.avg_wait')}</TableHead>
                      <TableHead>{t('dashboard.service_level')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(queueRows ?? []).map((r) => (
                      <TableRow key={r.queueId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tabular-nums">{r.number}</TableCell>
                        <TableCell className="tabular-nums">{r.answered}</TableCell>
                        <TableCell className="tabular-nums">{r.abandoned}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(r.avgWait)}</TableCell>
                        <TableCell className="tabular-nums">{r.serviceLevel}%</TableCell>
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
                <BarChart data={peak ?? []}>
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
              <Button variant="outline" size="sm" onClick={() => missed && exportToCsv('missed-calls', missed.map((m) => ({ caller: m.callerNumber, agent: agentName(m.agentId), date: formatDateTime(m.startedAt, lang), disposition: m.disposition })))}><Download className="h-4 w-4" />{t('common.export_csv')}</Button>
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
                  {(missed ?? []).map((m) => (
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
                  {(callbacks ?? []).map((c) => (
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
