import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Download, Search, Mic, FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Loader } from '@/components/shared/loader';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { callLogsApi, agentsApi, queuesApi } from '@/api';
import type { CallLog } from '@/types';
import type { CallLogFilters } from '@/api/callLogs';
import { useLanguage } from '@/hooks/use-language';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { exportToCsv } from '@/lib/export';

const PAGE_SIZE = 12;
const DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
const DISPOSITIONS = ['answered', 'missed', 'no_answer', 'busy', 'failed', 'abandoned'] as const;

export function CallLogsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const [filters, setFilters] = useState<CallLogFilters>({});
  const [page, setPage] = useState(1);

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: queues = [] } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });
  const { data: logs, isLoading } = useQuery({ queryKey: ['call-logs', filters], queryFn: () => callLogsApi.listCallLogs(filters) });

  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? '—';
  const queueName = (id?: string) => queues.find((q) => q.id === id)?.name ?? '—';

  const all = logs ?? [];
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const pageData = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setFilter = (patch: Partial<CallLogFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const handleExport = () => {
    exportToCsv('call-logs', all.map((l) => ({
      caller: l.callerNumber,
      destination: l.destinationNumber,
      direction: t(`call_logs.${l.direction}`),
      disposition: t(`status.${l.disposition}`),
      agent: agentName(l.agentId),
      queue: queueName(l.queueId),
      started: formatDateTime(l.startedAt, lang),
      duration: formatDuration(l.durationSec),
      talk: formatDuration(l.talkTimeSec),
    })));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('call_logs.title')}
        subtitle={t('call_logs.subtitle')}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={<Button variant="outline" onClick={handleExport}><Download className="h-4 w-4" />{t('common.export_csv')}</Button>}
      />

      <Card>
        <CardContent className="p-0">
          <div className="grid gap-3 border-b p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t('common.phone')} className="ps-9" onChange={(e) => setFilter({ search: e.target.value })} />
            </div>
            <Select onValueChange={(v) => setFilter({ direction: v === 'all' ? undefined : (v as CallLog['direction']) })}>
              <SelectTrigger><SelectValue placeholder={t('call_logs.direction')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{t(`call_logs.${d}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => setFilter({ disposition: v === 'all' ? undefined : (v as CallLog['disposition']) })}>
              <SelectTrigger><SelectValue placeholder={t('call_logs.disposition')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {DISPOSITIONS.map((d) => <SelectItem key={d} value={d}>{t(`status.${d}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => setFilter({ agentId: v === 'all' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder={t('live_calls.agent')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => setFilter({ queueId: v === 'all' ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder={t('live_calls.queue')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Loader />
          ) : pageData.length === 0 ? (
            <EmptyState icon={FileText} title={t('common.no_results')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('live_calls.caller')}</TableHead>
                    <TableHead>{t('call_logs.direction')}</TableHead>
                    <TableHead>{t('live_calls.agent')}</TableHead>
                    <TableHead>{t('live_calls.queue')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('common.duration')}</TableHead>
                    <TableHead>{t('call_logs.disposition')}</TableHead>
                    <TableHead>{t('call_logs.recording')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium tabular-nums">{l.callerNumber}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">← {l.destinationNumber}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{t(`call_logs.${l.direction}`)}</Badge></TableCell>
                      <TableCell className="text-sm">{agentName(l.agentId)}</TableCell>
                      <TableCell className="text-sm">{queueName(l.queueId)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateTime(l.startedAt, lang)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatDuration(l.durationSec)}</TableCell>
                      <TableCell><StatusBadge status={l.disposition} /></TableCell>
                      <TableCell>{l.recordingId ? <Mic className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {all.length > PAGE_SIZE && (
            <div className="border-t p-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={all.length} onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
