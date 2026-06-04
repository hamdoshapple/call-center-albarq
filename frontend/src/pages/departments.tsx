import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
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
import { departmentsApi, agentsApi } from '@/api';
import type { Department } from '@/types';
import type { DepartmentInput } from '@/api/departments';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#64748b'];

const emptyForm = (): DepartmentInput => ({ name: '', nameEn: '', description: '', color: COLORS[0], agentIds: [] });

export function DepartmentsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: departments, isLoading } = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.listDepartments });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('departments', 'create');
  const canEdit = hasPermission('departments', 'edit');
  const canDelete = hasPermission('departments', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['departments'] });
  const createMut = useMutation({ mutationFn: (i: DepartmentInput) => departmentsApi.createDepartment(i), onSuccess: () => { invalidate(); toast({ title: t('departments.add_department') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: DepartmentInput }) => departmentsApi.updateDepartment(id, i), onSuccess: () => { invalidate(); toast({ title: t('departments.edit_department') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => departmentsApi.deleteDepartment(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (d: Department) => { setEditing(d); setForm({ name: d.name, nameEn: d.nameEn, description: d.description, color: d.color, agentIds: d.agentIds }); setDialogOpen(true); };
  const submit = () => {
    if (!form.name) return;
    if (editing) updateMut.mutate({ id: editing.id, i: form });
    else createMut.mutate(form);
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(departments ?? []).map((d) => (
          <Card key={d.id} className="overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: d.color }} />
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ backgroundColor: d.color }}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{d.nameEn}</p>
                </div>
              </div>
              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground min-h-[40px]">{d.description}</p>
              <Badge variant="secondary" className="gap-1.5"><Users className="h-3.5 w-3.5" />{d.agentIds.length} {t('departments.agents_count')}</Badge>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {d.agentIds.slice(0, 5).map((id) => {
                  const a = agents.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <span key={id} className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" title={a.name}>
                      {a.name.split(' ')[0][0]}
                    </span>
                  );
                })}
                {d.agentIds.length > 5 && <span className="flex h-7 items-center rounded-full bg-muted px-2 text-xs">+{d.agentIds.length - 5}</span>}
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
              <div className="space-y-2"><Label>{t('common.name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Name (EN)</Label><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>{t('departments.description')}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>{t('departments.color')}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`h-8 w-8 rounded-full border-2 transition ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
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

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title={t('departments.delete_confirm')} confirmLabel={t('common.delete')} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} />
    </div>
  );
}
