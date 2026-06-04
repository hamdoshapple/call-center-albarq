import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListOrdered, Plus, Pencil, Trash2, Users, Timer, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
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
import { queuesApi, agentsApi, departmentsApi } from '@/api';
import type { Queue, RingStrategy, MissedCallBehavior } from '@/types';
import type { QueueInput } from '@/api/queues';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

const STRATEGIES: RingStrategy[] = ['ringall', 'linear', 'leastrecent', 'roundrobin'];
const BEHAVIORS: MissedCallBehavior[] = ['voicemail', 'callback', 'overflow', 'hangup'];

const emptyForm = (): QueueInput => ({
  name: '', number: '', strategy: 'ringall', maxWaitTime: 120, musicOnHold: 'default',
  announcement: '', missedBehavior: 'voicemail', agentIds: [], departmentId: undefined,
});

export function QueuesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: queues, isLoading } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.listDepartments });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [form, setForm] = useState<QueueInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('queues', 'create');
  const canEdit = hasPermission('queues', 'edit');
  const canDelete = hasPermission('queues', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['queues'] });
  const createMut = useMutation({ mutationFn: (i: QueueInput) => queuesApi.createQueue(i), onSuccess: () => { invalidate(); toast({ title: t('queues.add_queue') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: QueueInput }) => queuesApi.updateQueue(id, i), onSuccess: () => { invalidate(); toast({ title: t('queues.edit_queue') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => queuesApi.deleteQueue(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (q: Queue) => {
    setEditing(q);
    setForm({ name: q.name, number: q.number, strategy: q.strategy, maxWaitTime: q.maxWaitTime, musicOnHold: q.musicOnHold, announcement: q.announcement, missedBehavior: q.missedBehavior, agentIds: q.agentIds, departmentId: q.departmentId });
    setDialogOpen(true);
  };
  const submit = () => {
    if (!form.name || !form.number) return;
    if (editing) updateMut.mutate({ id: editing.id, i: form });
    else createMut.mutate(form);
    setDialogOpen(false);
  };
  const toggleAgent = (id: string) => setForm((f) => ({ ...f, agentIds: f.agentIds.includes(id) ? f.agentIds.filter((x) => x !== id) : [...f.agentIds, id] }));

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('queues.title')}
        subtitle={t('queues.subtitle')}
        icon={<ListOrdered className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('queues.add_queue')}</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {(queues ?? []).map((q) => (
          <Card key={q.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">{q.name}<Badge variant="outline">{q.number}</Badge></CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t('queues.strategy')}: {t(`queues.strategies.${q.strategy}`)}</p>
              </div>
              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Metric icon={Users} label={t('queues.members')} value={q.agentIds.length} />
                <Metric icon={Timer} label={t('queues.max_wait')} value={formatDuration(q.maxWaitTime)} />
                <Metric icon={Gauge} label={t('dashboard.service_level')} value={`${q.stats.serviceLevel}%`} />
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
                <div><p className="text-lg font-bold text-primary">{q.stats.waiting}</p><p className="text-xs text-muted-foreground">{t('status.waiting')}</p></div>
                <div><p className="text-lg font-bold text-success">{q.stats.answered}</p><p className="text-xs text-muted-foreground">{t('status.answered')}</p></div>
                <div><p className="text-lg font-bold text-warning">{q.stats.abandoned}</p><p className="text-xs text-muted-foreground">{t('status.abandoned')}</p></div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('queues.missed_behavior')}: {t(`queues.missed.${q.missedBehavior}`)}</span>
                <span>{t('queues.max_wait')}: {q.maxWaitTime}s</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('queues.edit_queue') : t('queues.add_queue')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>{t('common.name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('queues.number')}</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>{t('queues.strategy')}</Label>
              <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v as RingStrategy })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{t(`queues.strategies.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('queues.missed_behavior')}</Label>
              <Select value={form.missedBehavior} onValueChange={(v) => setForm({ ...form, missedBehavior: v as MissedCallBehavior })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BEHAVIORS.map((b) => <SelectItem key={b} value={b}>{t(`queues.missed.${b}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('queues.max_wait')} ({t('common.seconds')})</Label><Input type="number" value={form.maxWaitTime} onChange={(e) => setForm({ ...form, maxWaitTime: Number(e.target.value) })} /></div>
            <div className="space-y-2">
              <Label>{t('agents.department')}</Label>
              <Select value={form.departmentId ?? 'none'} onValueChange={(v) => setForm({ ...form, departmentId: v === 'none' ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('queues.music_on_hold')}</Label><Input value={form.musicOnHold} onChange={(e) => setForm({ ...form, musicOnHold: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('queues.announcement')}</Label><Input value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} /></div>
            <div className="sm:col-span-2 space-y-2">
              <Label>{t('queues.members')}</Label>
              <div className="flex flex-wrap gap-2">
                {agents.map((a) => (
                  <button key={a.id} type="button" onClick={() => toggleAgent(a.id)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${form.agentIds.includes(a.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
                    {a.name} ({a.extension})
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title={t('common.delete')} confirmLabel={t('common.delete')} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
