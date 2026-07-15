import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, Users, Search, PhoneCall, Wifi, WifiOff, Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { departmentsApi, agentsApi, queuesApi, asteriskApi } from '@/api';
import type { Department, AgentStatus } from '@/types';
import type { DepartmentInput } from '@/api/departments';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#64748b'];

const emptyForm = (): DepartmentInput => ({
  name: '',
  nameEn: '',
  description: '',
  color: COLORS[0],
  agentIds: [],
});

type LiveAgentStatus = {
  extension: string;
  status: AgentStatus | string;
  inCall?: boolean;
};

export function DepartmentsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: departments = [], isLoading } = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.listDepartments });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: queues = [] } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });
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
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('departments', 'create');
  const canEdit = hasPermission('departments', 'edit');
  const canDelete = hasPermission('departments', 'delete');

  const statusOf = (extension?: string, fallback?: AgentStatus) => {
    const live = liveByExt.get(String(extension || ''));
    if (live?.inCall) return 'busy' as AgentStatus;
    return (live?.status as AgentStatus) || fallback || 'offline';
  };

  const agentsForDepartment = (departmentId: string) =>
    agents.filter((a) => a.departmentId === departmentId);

  const queuesForDepartment = (departmentId: string) =>
    queues.filter((q) => q.departmentId === departmentId);

  const enriched = useMemo(() => {
    return departments.map((d) => {
      const deptAgents = agentsForDepartment(d.id);
      const deptQueues = queuesForDepartment(d.id);
      const online = deptAgents.filter((a) => statusOf(a.extension, a.status) === 'online').length;
      const busy = deptAgents.filter((a) => statusOf(a.extension, a.status) === 'busy').length;
      const offline = deptAgents.filter((a) => statusOf(a.extension, a.status) === 'offline').length;
      const paused = deptAgents.filter((a) => statusOf(a.extension, a.status) === 'paused').length;

      return {
        department: d,
        agents: deptAgents,
        queues: deptQueues,
        online,
        busy,
        offline,
        paused,
      };
    });
  }, [departments, agents, queues, liveByExt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(({ department, agents, queues }) => {
      return (
        department.name.toLowerCase().includes(q) ||
        department.nameEn.toLowerCase().includes(q) ||
        String(department.description || '').toLowerCase().includes(q) ||
        agents.some((a) => a.name.toLowerCase().includes(q) || String(a.extension).includes(q)) ||
        queues.some((x) => x.name.toLowerCase().includes(q) || String(x.number).includes(q))
      );
    });
  }, [enriched, search]);

  const totals = useMemo(() => {
    const totalAgents = agents.length;
    const online = agents.filter((a) => statusOf(a.extension, a.status) === 'online').length;
    const busy = agents.filter((a) => statusOf(a.extension, a.status) === 'busy').length;
    const offline = agents.filter((a) => statusOf(a.extension, a.status) === 'offline').length;
    return { departments: departments.length, totalAgents, online, busy, offline, queues: queues.length };
  }, [departments, agents, queues, liveByExt]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['queues'] });
  };

  const createMut = useMutation({
    mutationFn: (i: DepartmentInput) => departmentsApi.createDepartment(i),
    onSuccess: () => {
      invalidate();
      toast({ title: t('departments.add_department') });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, i }: { id: string; i: DepartmentInput }) => departmentsApi.updateDepartment(id, i),
    onSuccess: () => {
      invalidate();
      toast({ title: t('departments.edit_department') });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => departmentsApi.deleteDepartment(id),
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

  const openEdit = (d: Department) => {
    const deptAgents = agentsForDepartment(d.id);
    setEditing(d);
    setForm({
      name: d.name,
      nameEn: d.nameEn,
      description: d.description,
      color: d.color,
      agentIds: d.agentIds?.length ? d.agentIds : deptAgents.map((a) => a.id),
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name) return;
    const payload = {
      ...form,
      nameEn: form.nameEn || form.name,
    };

    if (editing) updateMut.mutate({ id: editing.id, i: payload });
    else createMut.mutate(payload);

    setDialogOpen(false);
  };

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('departments.title')}
        subtitle={t('departments.subtitle')}
        icon={<Building2 className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('departments.add_department')}</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="الأقسام" value={totals.departments} icon={Building2} tone="muted" />
        <StatCard label="الموظفون" value={totals.totalAgents} icon={Users} tone="muted" />
        <StatCard label="المتصلون" value={totals.online} icon={Wifi} tone="success" />
        <StatCard label="المشغولون" value={totals.busy} icon={PhoneCall} tone="warning" />
        <StatCard label="غير المتصلين" value={totals.offline} icon={WifiOff} tone="destructive" />
        <StatCard label="الكيوات" value={totals.queues} icon={Clock} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بالقسم، الموظف، التحويلة، أو الكيو..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(({ department: d, agents: deptAgents, queues: deptQueues, online, busy, offline, paused }) => (
          <Card key={d.id} className="overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: d.color }} />

            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: d.color }}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{d.name}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">{d.nameEn}</p>
                </div>
              </div>

              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="min-h-[40px] text-sm text-muted-foreground">{d.description || 'لا يوجد وصف لهذا القسم.'}</p>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted p-2">
                  <div className="font-mono text-base font-semibold">{deptAgents.length}</div>
                  <div className="text-muted-foreground">موظف</div>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <div className="font-mono text-base font-semibold text-emerald-600">{online}</div>
                  <div className="text-muted-foreground">متصل</div>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <div className="font-mono text-base font-semibold text-amber-600">{busy}</div>
                  <div className="text-muted-foreground">مشغول</div>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <div className="font-mono text-base font-semibold text-slate-500">{offline}</div>
                  <div className="text-muted-foreground">غير متصل</div>
                </div>
              </div>

              {!!paused && (
                <Badge variant="outline">متوقف مؤقتاً: {paused}</Badge>
              )}

              <div className="space-y-2">
                <Label className="text-xs">الكيوات المرتبطة</Label>
                <div className="flex flex-wrap gap-1.5">
                  {deptQueues.length ? (
                    deptQueues.map((q) => (
                      <Badge key={q.id} variant="outline">{q.name} ({q.number})</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">لا توجد كيوات مرتبطة بهذا القسم.</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">الموظفون</Label>
                <div className="space-y-2">
                  {deptAgents.length ? (
                    deptAgents.slice(0, 6).map((a) => {
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
                    <span className="text-xs text-muted-foreground">لا يوجد موظفون داخل هذا القسم.</span>
                  )}
                  {deptAgents.length > 6 && (
                    <Badge variant="secondary">+{deptAgents.length - 6} موظفين آخرين</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('departments.edit_department') : t('departments.add_department')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Name (EN)</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('departments.description')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>{t('departments.color')}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-8 w-8 rounded-full border-2 transition ${form.color === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
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

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('departments.delete_confirm')}
        confirmLabel={t('common.delete')}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
      />
    </div>
  );
}
