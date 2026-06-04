import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, PhoneForwarded, Users, ListOrdered, Globe } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Loader } from '@/components/shared/loader';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { transfersApi, agentsApi } from '@/api';
import type { TransferTarget } from '@/types';
import { useLanguage } from '@/hooks/use-language';
import { formatDateTime } from '@/lib/utils';

const targetIcon: Record<TransferTarget, typeof Users> = { agent: Users, queue: ListOrdered, external: Globe };

export function CallTransferPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const { data: transfers, isLoading } = useQuery({ queryKey: ['transfers'], queryFn: transfersApi.listTransfers });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? '—';

  const list = transfers ?? [];
  const blind = list.filter((x) => x.type === 'blind').length;
  const attended = list.filter((x) => x.type === 'attended').length;

  return (
    <div className="space-y-6">
      <PageHeader title={t('call_transfer.title')} subtitle={t('call_transfer.subtitle')} icon={<ArrowLeftRight className="h-5 w-5" />} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><PhoneForwarded className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{list.length}</p><p className="text-xs text-muted-foreground">{t('call_transfer.total')}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning/10 text-warning"><ArrowLeftRight className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{blind}</p><p className="text-xs text-muted-foreground">{t('call_transfer.blind')}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success"><Users className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{attended}</p><p className="text-xs text-muted-foreground">{t('call_transfer.attended')}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('call_transfer.history')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Loader />
          ) : list.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title={t('common.no_data')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('live_calls.caller')}</TableHead>
                    <TableHead>{t('call_transfer.from')}</TableHead>
                    <TableHead>{t('call_transfer.to')}</TableHead>
                    <TableHead>{t('call_transfer.type')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((tr) => {
                    const Icon = targetIcon[tr.targetType];
                    return (
                      <TableRow key={tr.id}>
                        <TableCell className="font-medium tabular-nums">{tr.callerNumber}</TableCell>
                        <TableCell>{agentName(tr.fromAgentId)}</TableCell>
                        <TableCell><span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{tr.targetLabel}</span></TableCell>
                        <TableCell><Badge variant="outline">{t(`call_transfer.${tr.type}`)}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(tr.timestamp, lang)}</TableCell>
                        <TableCell><StatusBadge status={tr.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
