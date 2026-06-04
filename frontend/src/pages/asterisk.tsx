import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Server, RefreshCw, CheckCircle2, XCircle, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { asteriskApi } from '@/api';
import type { AsteriskSettings } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

export function AsteriskPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({ queryKey: ['asterisk'], queryFn: asteriskApi.getAsteriskSettings });
  const { data: conn } = useQuery({ queryKey: ['asterisk-conn'], queryFn: asteriskApi.getConnectionStatus });
  const [form, setForm] = useState<AsteriskSettings | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const canEdit = hasPermission('asterisk', 'edit');

  const saveMut = useMutation({
    mutationFn: (s: AsteriskSettings) => asteriskApi.updateAsteriskSettings(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asterisk'] }); toast({ title: t('common.save'), description: t('asterisk.subtitle') }); },
  });
  const reloadMut = useMutation({
    mutationFn: () => asteriskApi.reloadConfig(),
    onSuccess: () => toast({ title: t('asterisk.reload_config'), description: t('asterisk.reload_success') }),
  });

  if (isLoading || !form) return <Loader />;

  const set = (patch: Partial<AsteriskSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('asterisk.title')}
        subtitle={t('asterisk.subtitle')}
        icon={<Server className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {canEdit && <Button variant="outline" onClick={() => reloadMut.mutate()} disabled={reloadMut.isPending}><RefreshCw className={`h-4 w-4 ${reloadMut.isPending ? 'animate-spin' : ''}`} />{t('asterisk.reload_config')}</Button>}
            {canEdit && <Button onClick={() => saveMut.mutate(form)}><Save className="h-4 w-4" />{t('common.save')}</Button>}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ConnCard label="AMI" ok={conn?.ami === 'connected'} text={conn?.ami ?? '—'} />
        <ConnCard label="ARI" ok={conn?.ari === 'connected'} text={conn?.ari ?? '—'} />
        <ConnCard label="SIP" ok={conn?.sip === 'registered'} text={conn?.sip ?? '—'} />
        <Card><CardContent className="flex flex-col justify-center p-4"><p className="text-xs text-muted-foreground">{t('asterisk.uptime')}</p><p className="text-lg font-bold">{formatDuration(conn?.uptimeSec ?? 0)}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('asterisk.server')}>
          <FormRow label={t('asterisk.server_ip')}><Input value={form.serverIp} disabled={!canEdit} onChange={(e) => set({ serverIp: e.target.value })} /></FormRow>
          <FormRow label={t('asterisk.sip_port')}><Input type="number" value={form.sipPort} disabled={!canEdit} onChange={(e) => set({ sipPort: Number(e.target.value) })} /></FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label={t('asterisk.rtp_start')}><Input type="number" value={form.rtpStart} disabled={!canEdit} onChange={(e) => set({ rtpStart: Number(e.target.value) })} /></FormRow>
            <FormRow label={t('asterisk.rtp_end')}><Input type="number" value={form.rtpEnd} disabled={!canEdit} onChange={(e) => set({ rtpEnd: Number(e.target.value) })} /></FormRow>
          </div>
        </Section>

        <Section title="AMI / ARI">
          <div className="grid grid-cols-2 gap-3">
            <FormRow label={t('asterisk.ami_host')}><Input value={form.amiHost} disabled={!canEdit} onChange={(e) => set({ amiHost: e.target.value })} /></FormRow>
            <FormRow label={t('asterisk.ami_port')}><Input type="number" value={form.amiPort} disabled={!canEdit} onChange={(e) => set({ amiPort: Number(e.target.value) })} /></FormRow>
          </div>
          <FormRow label={t('asterisk.ami_user')}><Input value={form.amiUser} disabled={!canEdit} onChange={(e) => set({ amiUser: e.target.value })} /></FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label={t('asterisk.ari_host')}><Input value={form.ariHost} disabled={!canEdit} onChange={(e) => set({ ariHost: e.target.value })} /></FormRow>
            <FormRow label={t('asterisk.ari_port')}><Input type="number" value={form.ariPort} disabled={!canEdit} onChange={(e) => set({ ariPort: Number(e.target.value) })} /></FormRow>
          </div>
          <FormRow label={t('asterisk.ari_user')}><Input value={form.ariUser} disabled={!canEdit} onChange={(e) => set({ ariUser: e.target.value })} /></FormRow>
        </Section>

        <Section title={t('asterisk.trunk')}>
          <FormRow label={t('asterisk.trunk_name')}><Input value={form.trunkName} disabled={!canEdit} onChange={(e) => set({ trunkName: e.target.value })} /></FormRow>
          <FormRow label={t('asterisk.trunk_host')}><Input value={form.trunkHost} disabled={!canEdit} onChange={(e) => set({ trunkHost: e.target.value })} /></FormRow>
        </Section>

        <Section title={t('asterisk.extensions')}>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label={t('asterisk.ext_start')}><Input type="number" value={form.extensionStart} disabled={!canEdit} onChange={(e) => set({ extensionStart: Number(e.target.value) })} /></FormRow>
            <FormRow label={t('asterisk.ext_end')}><Input type="number" value={form.extensionEnd} disabled={!canEdit} onChange={(e) => set({ extensionEnd: Number(e.target.value) })} /></FormRow>
          </div>
          <FormRow label={t('asterisk.recording_path')}><Input value={form.recordingPath} disabled={!canEdit} onChange={(e) => set({ recordingPath: e.target.value })} /></FormRow>
          <FormRow label={t('asterisk.codecs')}>
            <div className="flex flex-wrap gap-1.5">{form.codecs.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}</div>
          </FormRow>
        </Section>
      </div>
    </div>
  );
}

function ConnCard({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-semibold capitalize">{text}</p>
        </div>
        {ok ? <CheckCircle2 className="h-7 w-7 text-success" /> : <XCircle className="h-7 w-7 text-destructive" />}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
