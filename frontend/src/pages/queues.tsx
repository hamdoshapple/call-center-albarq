import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ListOrdered,
  Plus,
  Pencil,
  Trash2,
  Users,
  Timer,
  Gauge,
  Search,
  Building2,
  PhoneCall,
  Wifi,
  WifiOff,
  Clock,
  Activity,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { queuesApi, agentsApi, departmentsApi, asteriskApi } from '@/api';
import type { Queue, RingStrategy, MissedCallBehavior, AgentStatus } from '@/types';
import type { QueueInput } from '@/api/queues';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

const STRATEGIES: RingStrategy[] = ['ringall', 'linear', 'leastrecent', 'roundrobin'];
const BEHAVIORS: MissedCallBehavior[] = ['voicemail', 'callback', 'overflow', 'hangup'];

const emptyForm = (): QueueInput => ({
  name: '',
  number: '',
  strategy: 'ringall',
  maxWaitTime: 120,
  musicOnHold: 'queue_wait',
  announcement: '',
  missedBehavior: 'voicemail',
  agentIds: [],
  departmentId: undefined,
});

type LiveAgentStatus = {
  extension: string;
  status: AgentStatus | string;
  inCall?: boolean;
};

function num(v: unknown) {
  return Number(v || 0) || 0;
}

export function QueuesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: queues = [], isLoading } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.listDepartments });
  const { data: agentStatuses = [] } = useQuery({
    queryKey: ['agent-statuses'],
    queryFn: asteriskApi.listAgentStatuses,
    refetchInterval: 3000,
  });

  const liveByExt = useMemo(() => {
    const m = new Map<string, LiveAgentStatus>();
    (agentStatuses as LiveAgentStatus[]).forEach((s) => m.set(String(s.extension), s));
    return m;
  }, [agentStatuses]);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [form, setForm] = useState<QueueInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('queues', 'create');
  const canEdit = hasPermission('queues', 'edit');
  const canDelete = hasPermission('queues', 'delete');

  const statusOf = (extension?: string, fallback?: AgentStatus) => {
    const live = liveByExt.get(String(extension || ''));
    if (live?.inCall) return 'busy' as AgentStatus;
    return (live?.status as AgentStatus) || fallback || 'offline';
  };

  const departmentName = (id?: string) => {
    if (!id) return 'بدون قسم';
    return departments.find((d) => d.id === id)?.name ?? 'قسم غير معروف';
  };

  const queueAgents = (q: Queue) =>
    agents.filter((a) => (q.agentIds || []).includes(a.id));

  const enriched = useMemo(() => {
    return queues.map((q) => {
      const members = queueAgents(q);
      const online = members.filter((a) => statusOf(a.extension, a.status) === 'online').length;
      const busy = members.filter((a) => statusOf(a.extension, a.status) === 'busy').length;
      const offline = members.filter((a) => statusOf(a.extension, a.status) === 'offline').length;
      const waiting = num(q.stats?.waiting);
      const answered = num(q.stats?.answered);
      const abandoned = num(q.stats?.abandoned);
      const total = answered + abandoned;
      const successRate = total ? Math.round((answered / total) * 100) : 0;

      return {
        queue: q,
        members,
        online,
        busy,
        offline,
        waiting,
        answered,
        abandoned,
        successRate,
      };
    });
  }, [queues, agents, liveByExt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;

    return enriched.filter(({ queue, members }) => {
      const dep = departmentName(queue.departmentId).toLowerCase();
      return (
        queue.name.toLowerCase().includes(q) ||
        String(queue.number).includes(q) ||
        String(queue.strategy).toLowerCase().includes(q) ||
        dep.includes(q) ||
        members.some((a) => a.name.toLowerCase().includes(q) || String(a.extension).includes(q))
      );
    });
  }, [enriched, search, departments]);

  const totals = useMemo(() => {
    const members = new Set<string>();
    enriched.forEach((x) => x.members.forEach((a) => members.add(a.id)));

    return {
      queues: queues.length,
      members: members.size,
      waiting: enriched.reduce((s, x) => s + x.waiting, 0),
      answered: enriched.reduce((s, x) => s + x.answered, 0),
      abandoned: enriched.reduce((s, x) => s + x.abandoned, 0),
      busy: enriched.reduce((s, x) => s + x.busy, 0),
    };
  }, [queues, enriched]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['queues'] });
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['agent-statuses'] });
  };

  const createMut = useMutation({
    mutationFn: (i: QueueInput) => queuesApi.createQueue(i),
    onSuccess: () => {
      invalidate();
      toast({ title: t('queues.add_queue') });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, i }: { id: string; i: QueueInput }) => queuesApi.updateQueue(id, i),
    onSuccess: () => {
      invalidate();
      toast({ title: t('queues.edit_queue') });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => queuesApi.deleteQueue(id),
    onSuccess: () => {
      invalidate();
      toast({ title: t('common.delete') });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (q: Queue) => {
    setEditing(q);
    setForm({
      name: q.name,
      number: q.number,
      strategy: q.strategy,
      maxWaitTime: q.maxWaitTime,
      musicOnHold: q.musicOnHold || 'queue_wait',
      announcement: q.announcement,
      missedBehavior: q.missedBehavior,
      agentIds: q.agentIds || [],
      departmentId: q.departmentId,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name || !form.number) return;
    if (editing) updateMut.mutate({ id: editing.id, i: form });
    else createMut.mutate(form);
    setDialogOpen(false);
  };

  const toggleAgent = (id: string) => {
    setForm((f) => ({
      ...f,
      agentIds: f.agentIds.includes(id) ? f.agentIds.filter((x) => x !== id) : [...f.agentIds, id],
    }));
  };

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('queues.title')}
        subtitle={t('queues.subtitle')}
        icon={<ListOrdered className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('queues.add_queue')}</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="الكيوات" value={totals.queues} icon={ListOrdered} tone="muted" />
        <StatCard label="الأعضاء" value={totals.members} icon={Users} tone="muted" />
        <StatCard label="بالانتظار" value={totals.waiting} icon={Clock} tone="warning" />
        <StatCard label="مشغولون الآن" value={totals.busy} icon={PhoneCall} tone="warning" />
        <StatCard label="مجابة" value={totals.answered} icon={Wifi} tone="success" />
        <StatCard label="فائتة" value={totals.abandoned} icon={WifiOff} tone="destructive" />
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم الكيو، الرقم، القسم، الموظف، أو التحويلة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map(({ queue: q, members, online, busy, offline, waiting, answered, abandoned, successRate }) => (
          <Card key={q.id} className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {q.name}
                  <Badge variant="outline">{q.number}</Badge>
                  <Badge variant={waiting > 0 ? 'warning' : 'secondary'}>
                    {waiting} بالانتظار
                  </Badge>
                </CardTitle>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {departmentName(q.departmentId)}
                  </span>
                  <span>الاستراتيجية: {t(`queues.strategies.${q.strategy}`)}</span>
                  <span>MOH: {q.musicOnHold || 'default'}</span>
                </div>
              </div>

              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <MiniMetric label="الأعضاء" value={members.length} />
                <MiniMetric label="متصل" value={online} tone="success" />
                <MiniMetric label="مشغول" value={busy} tone="warning" />
                <MiniMetric label="غير متصل" value={offline} tone="muted" />
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
                <MiniMetric label="انتظار" value={waiting} tone={waiting ? 'warning' : 'muted'} />
                <MiniMetric label="مجابة" value={answered} tone="success" />
                <MiniMetric label="فائتة" value={abandoned} tone="destructive" />
                <MiniMetric label="نجاح" value={`${successRate}%`} tone="success" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric icon={Timer} label={t('queues.max_wait')} value={formatDuration(q.maxWaitTime)} />
                <Metric icon={Gauge} label={t('dashboard.service_level')} value={`${num(q.stats?.serviceLevel)}%`} />
                <Metric icon={Activity} label="متوسط الانتظار" value={formatDuration(num(q.stats?.avgWait))} />
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{t('queues.missed_behavior')}: {t(`queues.missed.${q.missedBehavior}`)}</Badge>
                {q.announcement && <Badge variant="outline">إعلان: {q.announcement}</Badge>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">أعضاء الكيو</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.length ? (
                    members.map((a) => {
                      const st = statusOf(a.extension, a.status);
                      return (
                        <div key={a.id} className="flex items-center justify-between rounded-lg border p-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">Ext: {a.extension || '—'}</div>
                          </div>
                          <StatusBadge status={st} pulse={st === 'online'} />
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-muted-foreground">لا يوجد أعضاء داخل هذا الكيو.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('queues.edit_queue') : t('queues.add_queue')}</DialogTitle></DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>

            <Field label={t('queues.number')}>
              <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            </Field>

            <Field label={t('queues.strategy')}>
              <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v as RingStrategy })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => <SelectItem key={s} value={s}>{t(`queues.strategies.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('queues.missed_behavior')}>
              <Select value={form.missedBehavior} onValueChange={(v) => setForm({ ...form, missedBehavior: v as MissedCallBehavior })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BEHAVIORS.map((b) => <SelectItem key={b} value={b}>{t(`queues.missed.${b}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label={`${t('queues.max_wait')} (${t('common.seconds')})`}>
              <Input type="number" value={form.maxWaitTime} onChange={(e) => setForm({ ...form, maxWaitTime: Number(e.target.value) })} />
            </Field>

            <Field label={t('agents.department')}>
              <Select value={form.departmentId ?? 'none'} onValueChange={(v) => setForm({ ...form, departmentId: v === 'none' ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('queues.music_on_hold')}>
              <Input value={form.musicOnHold} onChange={(e) => setForm({ ...form, musicOnHold: e.target.value })} />
            </Field>

            <Field label={t('queues.announcement')}>
              <Input value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} />
            </Field>

            <div className="sm:col-span-2 space-y-2">
              <Label>{t('queues.members')}</Label>
              <div className="flex flex-wrap gap-2">
                {agents.map((a) => {
                  const st = statusOf(a.extension, a.status);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAgent(a.id)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${form.agentIds.includes(a.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                    >
                      {a.name} ({a.extension}) - {t(`status.${st}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('common.delete')}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone = 'muted' }: { label: string; value: string | number; tone?: 'success' | 'warning' | 'destructive' | 'muted' }) {
  const toneClass = {
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    destructive: 'text-red-600',
    muted: 'text-slate-500',
  }[tone];

  return (
    <div className="rounded-lg bg-muted p-2">
      <div className={`font-mono text-base font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
