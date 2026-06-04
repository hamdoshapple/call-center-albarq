import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  PhoneCall,
  Phone,
  PhoneForwarded,
  Pause,
  Play,
  PhoneOff,
  StickyNote,
  UserSearch,
  MoreVertical,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { liveCallsApi, agentsApi, queuesApi, tg400Api } from '@/api';
import type { LiveCall, TransferRecord } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

export function LiveCallsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: calls = [] } = useQuery({
    queryKey: ['live-calls'],
    queryFn: liveCallsApi.listLiveCalls,
    refetchInterval: 2000,
  });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: queues = [] } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });
  const { data: lines = [] } = useQuery({ queryKey: ['lines'], queryFn: tg400Api.listLines });

  const agentName = (id?: string) => agents.find((a) => a.id === id || a.extension === id)?.name ?? id ?? '—';
  const queueName = (id?: string) => queues.find((q) => q.id === id || q.number === id)?.name ?? id ?? '—';
  const lineNumber = (id?: string) => lines.find((l) => l.id === id || l.number === id)?.number ?? id ?? '—';

  const refresh = () => qc.invalidateQueries({ queryKey: ['live-calls'] });

  const answer = useMutation({ mutationFn: (id: string) => liveCallsApi.answerCall(id), onSuccess: refresh });
  const hold = useMutation({ mutationFn: (id: string) => liveCallsApi.holdCall(id), onSuccess: refresh });
  const unhold = useMutation({ mutationFn: (id: string) => liveCallsApi.unholdCall(id), onSuccess: refresh });
  const hangup = useMutation({
    mutationFn: (id: string) => liveCallsApi.hangupCall(id),
    onSuccess: () => {
      toast({ title: t('live_calls.hangup'), description: t('status.ended') });
      setTimeout(refresh, 1600);
      refresh();
    },
  });

  const [noteCall, setNoteCall] = useState<LiveCall | null>(null);
  const [noteText, setNoteText] = useState('');
  const addNote = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => liveCallsApi.addCallNote(id, note),
    onSuccess: () => {
      toast({ title: t('live_calls.add_note'), description: t('common.save') });
      setNoteCall(null);
      setNoteText('');
      refresh();
    },
  });

  const [transferCall, setTransferCall] = useState<LiveCall | null>(null);

  const stats = useMemo(
    () => ({
      active: calls.filter((c) => c.status === 'active').length,
      waiting: calls.filter((c) => c.status === 'waiting').length,
      ringing: calls.filter((c) => c.status === 'ringing').length,
      onHold: calls.filter((c) => c.onHold).length,
    }),
    [calls]
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('live_calls.title')} subtitle={t('live_calls.subtitle')} icon={<PhoneCall className="h-5 w-5" />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('status.active')} value={stats.active} icon={PhoneCall} tone="success" />
        <StatCard label={t('status.waiting')} value={stats.waiting} icon={Phone} tone="warning" />
        <StatCard label={t('status.ringing')} value={stats.ringing} icon={PhoneCall} tone="primary" />
        <StatCard label={t('live_calls.on_hold')} value={stats.onHold} icon={Pause} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-0">
          {calls.length === 0 ? (
            <EmptyState icon={PhoneOff} title={t('live_calls.no_active')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('live_calls.caller')}</TableHead>
                    <TableHead>{t('live_calls.sim_line')}</TableHead>
                    <TableHead>{t('live_calls.queue')}</TableHead>
                    <TableHead>{t('live_calls.agent')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('common.duration')}</TableHead>
                    <TableHead className="text-end">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell>
                        <div className="font-medium tabular-nums">{call.callerNumber}</div>
                        {call.callerName && <div className="text-xs text-muted-foreground">{call.callerName}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">{lineNumber(call.simLineId)}</TableCell>
                      <TableCell className="text-sm">{queueName(call.queueId)}</TableCell>
                      <TableCell className="text-sm">{agentName(call.agentId)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={call.status} pulse={call.status === 'active' || call.status === 'ringing'} />
                          {call.onHold && <Badge variant="warning">{t('live_calls.on_hold')}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{formatDuration(call.durationSec)}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          {(call.status === 'ringing' || call.status === 'waiting') && (
                            <Button size="sm" variant="success" onClick={() => answer.mutate(call.id)}>
                              <Phone className="h-3.5 w-3.5" />
                              {t('live_calls.answer')}
                            </Button>
                          )}
                          {call.status === 'active' && (
                            <Button
                              size="icon-sm"
                              variant="outline"
                              title={call.onHold ? t('live_calls.unhold') : t('live_calls.hold')}
                              onClick={() => (call.onHold ? unhold.mutate(call.id) : hold.mutate(call.id))}
                            >
                              {call.onHold ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon-sm" variant="ghost">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTransferCall(call)}>
                                <PhoneForwarded className="h-4 w-4" />
                                {t('live_calls.transfer')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setNoteCall(call); setNoteText(call.note ?? ''); }}>
                                <StickyNote className="h-4 w-4" />
                                {t('live_calls.add_note')}
                              </DropdownMenuItem>
                              {call.subscriberId && (
                                <DropdownMenuItem onClick={() => navigate(`/subscribers/${call.subscriberId}`)}>
                                  <UserSearch className="h-4 w-4" />
                                  {t('live_calls.open_subscriber')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => hangup.mutate(call.id)}>
                                <PhoneOff className="h-4 w-4" />
                                {t('live_calls.hangup')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note dialog */}
      <Dialog open={!!noteCall} onOpenChange={(o) => !o && setNoteCall(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('live_calls.add_note')}</DialogTitle>
            <DialogDescription>{noteCall?.callerNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('common.note')}</Label>
            <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteCall(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => noteCall && addNote.mutate({ id: noteCall.id, note: noteText })}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <TransferDialog
        call={transferCall}
        onClose={() => setTransferCall(null)}
        agents={agents.map((a) => ({ id: a.id, label: `${a.name} (${a.extension})` }))}
        queues={queues.map((q) => ({ id: q.id, label: `${q.name} (${q.number})` }))}
        onDone={() => {
          toast({ title: t('live_calls.transfer'), description: t('status.completed') });
          setTransferCall(null);
          qc.invalidateQueries({ queryKey: ['transfers'] });
          refresh();
        }}
      />
    </div>
  );
}

interface Option { id: string; label: string; }

function TransferDialog({
  call,
  onClose,
  agents,
  queues,
  onDone,
}: {
  call: LiveCall | null;
  onClose: () => void;
  agents: Option[];
  queues: Option[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<TransferRecord['type']>('blind');
  const [targetType, setTargetType] = useState<TransferRecord['targetType']>('agent');
  const [targetId, setTargetId] = useState('');
  const [external, setExternal] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const opts = targetType === 'agent' ? agents : queues;
      const label =
        targetType === 'external' ? external : opts.find((o) => o.id === targetId)?.label ?? targetId;
      return liveCallsApi.transferCall(call!.id, {
        type,
        targetType,
        targetId: targetType === 'external' ? external : targetId,
        targetLabel: label,
      });
    },
    onSuccess: onDone,
  });

  const options = targetType === 'agent' ? agents : queues;
  const valid = targetType === 'external' ? external.length >= 3 : !!targetId;

  return (
    <Dialog open={!!call} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('live_calls.transfer')}</DialogTitle>
          <DialogDescription>{call?.callerNumber}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('call_transfer.transfer_type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as TransferRecord['type'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blind">{t('call_transfer.blind')}</SelectItem>
                <SelectItem value="attended">{t('call_transfer.attended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('call_transfer.target')}</Label>
            <Select value={targetType} onValueChange={(v) => { setTargetType(v as TransferRecord['targetType']); setTargetId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">{t('call_transfer.to_agent')}</SelectItem>
                <SelectItem value="queue">{t('call_transfer.to_queue')}</SelectItem>
                <SelectItem value="external">{t('call_transfer.to_external')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetType === 'external' ? (
            <div className="space-y-2">
              <Label>{t('call_transfer.to_external')}</Label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={external}
                onChange={(e) => setExternal(e.target.value)}
                placeholder="07XXXXXXXXX"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{targetType === 'agent' ? t('call_transfer.to_agent') : t('call_transfer.to_queue')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue placeholder={t('common.search')} /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!valid} onClick={() => mutation.mutate()}>{t('live_calls.transfer')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
