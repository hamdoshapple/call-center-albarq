import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Signal, Plus } from 'lucide-react';
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
import { useToast } from '@/components/ui/use-toast';

const STATUSES: LineStatus[] = ['active', 'inactive', 'no_sim', 'error'];


const emptyForm = (slot: number): LineInput => ({
  slot, number: '', carrier: '', status: 'no_sim', signal: 0, purpose: '',
  inboundRoute: '-', outboundRoute: '-', usage: { calls: 0, minutes: 0, cost: 0 }, balance: 0,
});

export function TG400Page() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: lines, isLoading } = useQuery({ queryKey: ['lines'], queryFn: tg400Api.listLines });
  const { data: live, isLoading: liveLoading } = useQuery({ queryKey: ['tg400-live'], queryFn: tg400Api.liveStatus, refetchInterval: 5000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TG400Line | null>(null);
  const [form, setForm] = useState<LineInput>(emptyForm(1));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = hasPermission('tg400', 'create');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lines'] });
  const createMut = useMutation({ mutationFn: (i: LineInput) => tg400Api.createLine(i), onSuccess: () => { invalidate(); toast({ title: t('common.create') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: LineInput }) => tg400Api.updateLine(id, i), onSuccess: () => { invalidate(); toast({ title: t('common.update') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => tg400Api.deleteLine(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const openCreate = () => { setEditing(null); setForm(emptyForm((lines?.length ?? 0) + 1)); setDialogOpen(true); };
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


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Live TG400</span>
            <StatusBadge status={live?.gateway.online ? 'active' : 'error'} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs sm:grid-cols-4">
          <Row label="Gateway" value={live?.gateway.ip || '192.168.0.6'} />
          <Row label="HTTP" value={live?.gateway.online ? `Online ${live.gateway.latencyMs ?? '-'}ms` : 'Offline'} />
          <Row label="Route" value={live?.vpn.routeOk ? `OK ${live.vpn.interface}` : 'Bad'} />
          <Row label="SIP 20001" value={live?.sip.registered ? 'Registered' : 'Unavailable'} />
        </CardContent>
      </Card>

      <LiveStatusCard live={live} loading={liveLoading} />

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          معلومات الشرايح اليدوية مخفية حالياً لأن الحالة الحقيقية تُقرأ من TG400 Live بالأعلى.
        </CardContent>
      </Card>

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


function LiveStatusCard({ live, loading }: { live: any; loading: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">TG400 Gateway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label="IP" value={live?.gateway?.ip || '192.168.0.6'} />
          <Row label="Status" value={loading ? 'Checking...' : live?.gateway?.online ? 'Online' : 'Offline'} />
          <Row label="HTTP" value={live?.gateway?.httpStatus ? String(live.gateway.httpStatus) : '—'} />
          <Row label="Latency" value={live?.gateway?.latencyMs != null ? `${live.gateway.latencyMs} ms` : '—'} />
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">VPN Route</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label="Route" value={live?.vpn?.routeOk ? 'OK' : 'Bad'} />
          <Row label="Interface" value={live?.vpn?.interface || '—'} />
          <Row label="PPP Links" value={String(live?.vpn?.ppp?.length ?? 0)} />
          <Row label="Updated" value={live?.checkedAt ? new Date(live.checkedAt).toLocaleTimeString() : '—'} />
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">SIP Trunk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label="Endpoint" value={live?.sip?.endpoint || '20001'} />
          <Row label="State" value={live?.sip?.registered ? 'Available' : 'Unavailable'} />
          <Row label="Contact" value={live?.sip?.raw || '—'} />
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" variant="outline" onClick={() => window.open('http://192.168.0.6', '_blank')}>
            فتح TG400
          </Button>
          <p className="text-xs text-muted-foreground">
            يتم تحديث الحالة تلقائياً كل 5 ثواني من السيرفر مباشرة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
