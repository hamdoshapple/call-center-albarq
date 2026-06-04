import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Search, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { agentsApi, departmentsApi, queuesApi } from '@/api';
import type { Agent, AgentStatus } from '@/types';
import type { AgentInput } from '@/api/agents';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

const STATUSES: AgentStatus[] = ['online', 'offline', 'busy', 'paused'];

const emptyForm = (): AgentInput => ({
  name: '',
  extension: '',
  sipUsername: '',
  sipPassword: '',
  email: '',
  departmentId: '',
  status: 'offline',
  queues: [],
  workingHours: { from: '09:00', to: '17:00', days: [0, 1, 2, 3, 4] },
});

export function AgentsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.listDepartments });
  const { data: queues = [] } = useQuery({ queryKey: ['queues'], queryFn: queuesApi.listQueues });

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentInput>(emptyForm());
  const [showPassword, setShowPassword] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('agents', 'create');
  const canEdit = hasPermission('agents', 'edit');
  const canDelete = hasPermission('agents', 'delete');

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents ?? [];
    return (agents ?? []).filter(
      (a) => a.name.toLowerCase().includes(q) || a.extension.includes(q) || a.sipUsername.toLowerCase().includes(q)
    );
  }, [agents, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
  };

  const createMut = useMutation({
    mutationFn: (input: AgentInput) => agentsApi.createAgent(input),
    onSuccess: () => { invalidate(); toast({ title: t('agents.add_agent'), description: t('common.create') }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AgentInput }) => agentsApi.updateAgent(id, input),
    onSuccess: () => { invalidate(); toast({ title: t('agents.edit_agent'), description: t('common.update') }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => agentsApi.deleteAgent(id),
    onSuccess: () => { invalidate(); toast({ title: t('common.delete'), description: t('common.delete') }); },
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (a: Agent) => {
    setEditing(a);
    setForm({
      name: a.name, extension: a.extension, sipUsername: a.sipUsername, sipPassword: a.sipPassword,
      email: a.email, departmentId: a.departmentId, status: a.status, queues: a.queues, workingHours: a.workingHours,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name || !form.extension) return;
    if (editing) updateMut.mutate({ id: editing.id, input: form });
    else createMut.mutate(form);
    setDialogOpen(false);
  };

  const toggleQueue = (id: string) => {
    setForm((f) => ({ ...f, queues: f.queues.includes(id) ? f.queues.filter((x) => x !== id) : [...f.queues, id] }));
  };

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('agents.title')}
        subtitle={t('agents.subtitle')}
        icon={<Users className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('agents.add_agent')}</Button>}
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-3">
            <div className="relative max-w-sm">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('agents.extension')}</TableHead>
                  <TableHead>{t('agents.department')}</TableHead>
                  <TableHead>{t('agents.queues')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('agents.calls_handled')}</TableHead>
                  <TableHead>{t('agents.avg_handle')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.email}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{a.extension}</TableCell>
                    <TableCell className="text-sm">{deptName(a.departmentId)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.queues.map((q) => (
                          <Badge key={q} variant="outline">{queues.find((x) => x.id === q)?.number ?? q}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={a.status} pulse={a.status === 'online'} /></TableCell>
                    <TableCell className="tabular-nums">{a.performance.callsHandled}</TableCell>
                    <TableCell className="tabular-nums">{formatDuration(a.performance.avgHandleTime)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button size="icon-sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                        )}
                        {canDelete && (
                          <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('agents.edit_agent') : t('agents.add_agent')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('agents.extension')}><Input value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} /></Field>
            <Field label={t('agents.sip_username')}><Input value={form.sipUsername} onChange={(e) => setForm({ ...form, sipUsername: e.target.value })} /></Field>
            <Field label={t('agents.sip_password')}>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={form.sipPassword} onChange={(e) => setForm({ ...form, sipPassword: e.target.value })} className="pe-9" />
                <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('agents.department')}>
              <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                <SelectTrigger><SelectValue placeholder={t('common.none')} /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('common.status')}>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AgentStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2 space-y-2">
              <Label>{t('agents.queues')}</Label>
              <div className="flex flex-wrap gap-2">
                {queues.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => toggleQueue(q.id)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${form.queues.includes(q.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    {q.name}
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

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('agents.delete_confirm')}
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
