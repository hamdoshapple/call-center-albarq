import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Signal, SignalLow, SignalMedium, SignalHigh, Pencil, Plus, Trash2, Phone } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { tg400Api } from '@/api';
import type { TG400Line, LineStatus } from '@/types';
import type { LineInput } from '@/api/tg400';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';

const STATUSES: LineStatus[] = ['active', 'inactive', 'no_sim', 'error'];

function SignalIcon({ value }: { value: number }) {
  if (value === 0) return <SignalLow className="h-4 w-4 text-muted-foreground" />;
  if (value < 50) return <SignalLow className="h-4 w-4 text-destructive" />;
  if (value < 75) return <SignalMedium className="h-4 w-4 text-warning" />;
  return <SignalHigh className="h-4 w-4 text-success" />;
}

const emptyForm = (slot: number): LineInput => ({
  slot, number: '', carrier: '', status: 'no_sim', signal: 0, purpose: '',
  inboundRoute: '-', outboundRoute: '-', usage: { calls: 0, minutes: 0, cost: 0 }, balance: 0,
});

export function TG400Page() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: lines, isLoading } = useQuery({ queryKey: ['lines'], queryFn: tg400Api.listLines });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TG400Line | null>(null);
  const [form, setForm] = useState<LineInput>(emptyForm(1));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('tg400', 'create');
  const canEdit = hasPermission('tg400', 'edit');
  const canDelete = hasPermission('tg400', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lines'] });
  const createMut = useMutation({ mutationFn: (i: LineInput) => tg400Api.createLine(i), onSuccess: () => { invalidate(); toast({ title: t('common.create') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: LineInput }) => tg400Api.updateLine(id, i), onSuccess: () => { invalidate(); toast({ title: t('common.update') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => tg400Api.deleteLine(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const openCreate = () => { setEditing(null); setForm(emptyForm((lines?.length ?? 0) + 1)); setDialogOpen(true); };
  const openEdit = (l: TG400Line) => { setEditing(l); setForm({ ...l }); setDialogOpen(true); };
  const submit = () => {
    if (!form.number) return;
    if (editing) updateMut.mutate({ id: editing.id, i: form });
    else createMut.mutate(form);
    setDialogOpen(false);
  };

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tg400.title')}
        subtitle={t('tg400.subtitle')}
        icon={<Signal className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" />{t('common.add')}</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(lines ?? []).map((l) => (
          <Card key={l.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">{l.slot}</div>
                <div>
                  <CardTitle className="text-sm tabular-nums">{l.number || '—'}</CardTitle>
                  <p className="text-xs text-muted-foreground">{l.carrier || t('status.no_sim')}</p>
                </div>
              </div>
              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(l.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={l.status} pulse={l.status === 'active'} />
                <div className="flex items-center gap-1 text-xs"><SignalIcon value={l.signal} />{l.signal}%</div>
              </div>
              <div className="space-y-1.5 text-xs">
                <Row label={t('tg400.purpose')} value={l.purpose || '—'} />
                <Row label={t('tg400.inbound_route')} value={l.inboundRoute} />
                <Row label={t('tg400.outbound_route')} value={l.outboundRoute} />
                <Row label={t('tg400.balance')} value={formatCurrency(l.balance, lang)} />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2 text-xs">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.usage.calls} {t('tg400.calls')}</span>
                <span>{l.usage.minutes} {t('tg400.minutes')}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('common.edit') : t('common.add')} — {t('tg400.slot')} {form.slot}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>{t('tg400.slot')}</Label><Input type="number" value={form.slot} onChange={(e) => setForm({ ...form, slot: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>{t('common.phone')}</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('tg400.carrier')}</Label><Input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>{t('common.status')}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LineStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('tg400.signal')} (%)</Label><Input type="number" value={form.signal} onChange={(e) => setForm({ ...form, signal: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>{t('tg400.purpose')}</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('tg400.inbound_route')}</Label><Input value={form.inboundRoute} onChange={(e) => setForm({ ...form, inboundRoute: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('tg400.outbound_route')}</Label><Input value={form.outboundRoute} onChange={(e) => setForm({ ...form, outboundRoute: e.target.value })} /></div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-end truncate">{value}</span>
    </div>
  );
}
