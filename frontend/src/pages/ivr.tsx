import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Pencil, Trash2, Phone, ArrowRight, RadioTower } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { ivrApi, voicePromptsApi } from '@/api';
import type { IVRMenu, IVROption, IVRDestinationType } from '@/types';
import type { IVRInput } from '@/api/ivr';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';


const DEST_TYPES: IVRDestinationType[] = ['queue', 'department', 'agent', 'ivr', 'voicemail', 'hangup', 'external'];
const KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];

const emptyForm = (): IVRInput => ({
  name: '', description: '', greetingPromptId: undefined, options: [], timeout: 10,
  timeoutDestination: 'hangup', invalidDestination: 'repeat', repeatOnInvalid: true, maxRepeats: 3, active: true,
});

export function IVRPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: menus, isLoading } = useQuery({ queryKey: ['ivr'], queryFn: ivrApi.listIVR });
  const { data: prompts = [] } = useQuery({ queryKey: ['prompts'], queryFn: voicePromptsApi.listPrompts });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IVRMenu | null>(null);
  const [form, setForm] = useState<IVRInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('ivr', 'create');
  const canEdit = hasPermission('ivr', 'edit');
  const canDelete = hasPermission('ivr', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ivr'] });
  const createMut = useMutation({ mutationFn: (i: IVRInput) => ivrApi.createIVR(i), onSuccess: () => { invalidate(); toast({ title: t('ivr.add_menu') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: IVRInput }) => ivrApi.updateIVR(id, i), onSuccess: () => { invalidate(); toast({ title: t('common.update') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => ivrApi.deleteIVR(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const applyMut = useMutation({
    mutationFn: (id: string) => ivrApi.applyIVR(id),
    onSuccess: () => toast({ title: 'تم تطبيق IVR على السنترال' }),
    onError: () => toast({ title: 'فشل تطبيق IVR', variant: 'destructive' }),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (m: IVRMenu) => { setEditing(m); setForm({ name: m.name, description: m.description, greetingPromptId: m.greetingPromptId, options: m.options, timeout: m.timeout, timeoutDestination: m.timeoutDestination, invalidDestination: m.invalidDestination, repeatOnInvalid: m.repeatOnInvalid, maxRepeats: m.maxRepeats, active: m.active }); setDialogOpen(true); };
  const submit = () => {
    if (!form.name) return;
    if (editing) updateMut.mutate({ id: editing.id, i: form });
    else createMut.mutate(form);
    setDialogOpen(false);
  };

  const addOption = () => setForm((f) => ({ ...f, options: [...f.options, { id: `opt-${crypto.randomUUID()}`, key: KEYS.find((k) => !f.options.some((o) => o.key === k)) ?? '0', label: '', destinationType: 'queue', destinationValue: '2009' }] }));
  const updateOption = (id: string, patch: Partial<IVROption>) => setForm((f) => ({ ...f, options: f.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const removeOption = (id: string) => setForm((f) => ({ ...f, options: f.options.filter((o) => o.id !== id) }));

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ivr.title')}
        subtitle={t('ivr.subtitle')}
        icon={<Network className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('ivr.add_menu')}</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {(menus ?? []).map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">{m.name}{m.active ? <Badge className="bg-success/15 text-success">{t('common.active')}</Badge> : <Badge variant="secondary">{t('common.inactive')}</Badge>}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
              </div>
              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="secondary" title="تطبيق على السنترال" onClick={() => applyMut.mutate(m.id)}><RadioTower className="h-3.5 w-3.5" /></Button>}
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">{t('ivr.greeting')}:</span>
                <span className="font-medium">{prompts.find((p) => p.id === m.greetingPromptId)?.name ?? '—'}</span>
              </div>
              {m.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">{o.key}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
                  <span className="font-medium">{o.label}</span>
                  <Badge variant="outline" className="ms-auto">{t(`ivr.dest.${o.destinationType}`)}</Badge>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                <span>{t('ivr.timeout')}: {m.timeout}s</span>
                <span>{t('ivr.max_repeats')}: {m.maxRepeats}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('ivr.edit_menu') : t('ivr.add_menu')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>{t('common.name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>{t('ivr.greeting')}</Label>
                <Select value={form.greetingPromptId ?? 'none'} onValueChange={(v) => setForm({ ...form, greetingPromptId: v === 'none' ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none')}</SelectItem>
                    {prompts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>{t('departments.description')}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('ivr.options')}</Label>
                <Button size="sm" variant="outline" onClick={addOption}><Plus className="h-3.5 w-3.5" />{t('common.add')}</Button>
              </div>
              <div className="space-y-2">
                {form.options.map((o) => (
                  <div key={o.id} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[64px_1fr_1fr_1fr_40px] md:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('ivr.key')}</Label>
                      <Select value={o.key} onValueChange={(v) => updateOption(o.id, { key: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('common.name')}</Label>
                      <Input value={o.label} onChange={(e) => updateOption(o.id, { label: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('ivr.destination')}</Label>
                      <Select value={o.destinationType} onValueChange={(v) => updateOption(o.id, { destinationType: v as IVRDestinationType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{DEST_TYPES.map((d) => <SelectItem key={d} value={d}>{t(`ivr.dest.${d}`)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">قيمة الوجهة</Label>
                      {o.destinationType === 'queue' || o.destinationType === 'department' ? (
                        <Select
                          value={o.destinationValue ?? '2009'}
                          onValueChange={(v) => updateOption(o.id, { destinationValue: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2009">كل الموظفين - 2009</SelectItem>
                            <SelectItem value="2000">الدعم الفني - 2000</SelectItem>
                            <SelectItem value="2001">المحاسبة - 2001</SelectItem>
                            <SelectItem value="2002">المبيعات - 2002</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          placeholder="102 أو رقم خارجي"
                          value={o.destinationValue ?? ''}
                          onChange={(e) => updateOption(o.id, { destinationValue: e.target.value })}
                        />
                      )}
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeOption(o.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>{t('ivr.timeout')} ({t('common.seconds')})</Label><Input type="number" value={form.timeout} onChange={(e) => setForm({ ...form, timeout: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>{t('ivr.max_repeats')}</Label><Input type="number" value={form.maxRepeats} onChange={(e) => setForm({ ...form, maxRepeats: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t('common.active')}</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title={t('ivr.delete_confirm')} confirmLabel={t('common.delete')} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} />
    </div>
  );
}
