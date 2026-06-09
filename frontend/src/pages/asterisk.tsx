import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Network,
  PhoneCall,
  RefreshCw,
  Router,
  Save,
  Server,
  Settings,
  TerminalSquare,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { asteriskApi } from '@/api';
import type { AsteriskSettings } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';
import { formatDuration } from '@/lib/utils';

type AdvancedAsteriskSettings = AsteriskSettings & {
  endpointIdentifierOrder?: string;
  pjsipConfPath?: string;
  extensionsConfPath?: string;
  tg400Endpoint?: string;
  tg400Username?: string;
  tg400Password?: string;
  tg400Match?: string;
  tg400Transport?: string;
  tg400Context?: string;
  externalMediaAddress?: string;
  externalSignalingAddress?: string;
  localNet?: string;
  allowedSipRanges?: string;
  blockedSipRanges?: string;
};

type TabKey =
  | 'overview'
  | 'settings'
  | 'tg400'
  | 'security'
  | 'contacts'
  | 'endpoints'
  | 'queues'
  | 'channels'
  | 'pjsip'
  | 'console';

const REFRESH_MS = 5000;

const safeCommands = [
  'pjsip show contacts',
  'pjsip show endpoints',
  'pjsip show registrations',
  'pjsip show transports',
  'pjsip show settings',
  'core show channels',
  'core show uptime',
  'queue show',
];

export function AsteriskPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasPermission('asterisk', 'edit');

  const [tab, setTab] = useState<TabKey>('overview');
  const [command, setCommand] = useState('pjsip show contacts');
  const [cliOutput, setCliOutput] = useState('');
  const [form, setForm] = useState<AdvancedAsteriskSettings | null>(null);

  const settingsQ = useQuery({
    queryKey: ['asterisk-settings'],
    queryFn: asteriskApi.getAsteriskSettings,
  });

  const statusQ = useQuery({
    queryKey: ['asterisk-status'],
    queryFn: asteriskApi.getConnectionStatus,
    refetchInterval: REFRESH_MS,
  });

  const contactsQ = useQuery({
    queryKey: ['asterisk-contacts-json'],
    queryFn: asteriskApi.getAsteriskContactsJson,
    refetchInterval: REFRESH_MS,
  });

  const endpointsQ = useQuery({
    queryKey: ['asterisk-endpoints-json'],
    queryFn: asteriskApi.getAsteriskEndpointsJson,
    refetchInterval: REFRESH_MS,
  });

  const queuesQ = useQuery({
    queryKey: ['asterisk-queues-json'],
    queryFn: asteriskApi.getAsteriskQueuesJson,
    refetchInterval: REFRESH_MS,
  });

  const channelsQ = useQuery({
    queryKey: ['asterisk-channels-json'],
    queryFn: asteriskApi.getAsteriskChannelsJson,
    refetchInterval: REFRESH_MS,
  });

  const pjsipSettingsQ = useQuery({
    queryKey: ['asterisk-pjsip-settings'],
    queryFn: asteriskApi.getAsteriskPjsipSettings,
    enabled: tab === 'pjsip' || tab === 'overview',
  });

  const transportsQ = useQuery({
    queryKey: ['asterisk-transports'],
    queryFn: asteriskApi.getAsteriskTransports,
    enabled: tab === 'pjsip' || tab === 'overview',
  });

  const registrationsQ = useQuery({
    queryKey: ['asterisk-registrations'],
    queryFn: asteriskApi.getAsteriskRegistrations,
    enabled: tab === 'pjsip' || tab === 'overview',
  });

  const tg400RawQ = useQuery({
    queryKey: ['asterisk-tg400-endpoint-raw'],
    queryFn: () => asteriskApi.runAsteriskCli('pjsip show endpoint 20001'),
    refetchInterval: REFRESH_MS,
  });

  const tg400IdentifyQ = useQuery({
    queryKey: ['asterisk-tg400-identify-raw'],
    queryFn: () => asteriskApi.runAsteriskCli('pjsip show identify tg400'),
    refetchInterval: REFRESH_MS,
  });

  const rtpRawQ = useQuery({
    queryKey: ['asterisk-rtp-raw'],
    queryFn: () => asteriskApi.runAsteriskCli('rtp show settings'),
    refetchInterval: REFRESH_MS,
  });

  const httpRawQ = useQuery({
    queryKey: ['asterisk-http-raw'],
    queryFn: () => asteriskApi.runAsteriskCli('http show status'),
    refetchInterval: REFRESH_MS,
  });

  const managerRawQ = useQuery({
    queryKey: ['asterisk-manager-raw'],
    queryFn: () => asteriskApi.runAsteriskCli('manager show settings'),
    refetchInterval: REFRESH_MS,
  });

  useEffect(() => {
    if (settingsQ.data) setForm(settingsQ.data as AdvancedAsteriskSettings);
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: (s: AdvancedAsteriskSettings) => asteriskApi.updateAsteriskSettings(s as AsteriskSettings),
    onSuccess: () => {
      toast({ title: t('asterisk.settingsSaved'), description: t('asterisk.settingsSavedDesc') });
      void qc.invalidateQueries({ queryKey: ['asterisk-settings'] });
    },
  });

  const reloadPjsipMut = useMutation({
    mutationFn: asteriskApi.reloadPjsip,
    onSuccess: () => {
      toast({ title: t('asterisk.pjsipReloaded'), description: t('asterisk.pjsipReloadedDesc') });
      invalidateAll(qc);
    },
  });

  const reloadDialplanMut = useMutation({
    mutationFn: asteriskApi.reloadDialplan,
    onSuccess: () => {
      toast({ title: t('asterisk.dialplanReloaded'), description: t('asterisk.dialplanReloadedDesc') });
      invalidateAll(qc);
    },
  });

  const reloadConfigMut = useMutation({
    mutationFn: asteriskApi.reloadConfig,
    onSuccess: () => {
      toast({ title: t('asterisk.configReloaded'), description: t('asterisk.configReloadedDesc') });
      invalidateAll(qc);
    },
  });

  const cliMut = useMutation({
    mutationFn: asteriskApi.runAsteriskCli,
    onSuccess: (r) => setCliOutput(r.stdout || r.stderr || t('asterisk.empty.noOutput')),
    onError: (err) => setCliOutput(err instanceof Error ? err.message : 'Command failed'),
  });

  const contacts = contactsQ.data ?? [];
  const endpoints = endpointsQ.data ?? [];
  const queues = queuesQ.data ?? [];
  const channels = channelsQ.data;
  const status = statusQ.data;

  const registeredEndpoints = useMemo(() => {
    const online = new Set(contacts.filter((c) => c.status.toLowerCase() === 'avail').map((c) => c.aor));
    return endpoints.filter((e) => online.has(e.endpoint)).length;
  }, [contacts, endpoints]);

  const tg400 = endpoints.find((e) => e.endpoint.includes('20001'));
  const tg400Contact = contacts.find((c) => c.aor === '20001');

  if (settingsQ.isLoading) return <Loader />;

  const liveForm = form ?? ({} as AdvancedAsteriskSettings);
  const tg400Raw = tg400RawQ.data?.stdout || '';
  const tg400IdentifyRaw = tg400IdentifyQ.data?.stdout || '';
  const rawContext = tg400Raw.match(/context\s+:\s+([^\n]+)/)?.[1]?.trim() || liveForm.tg400Context || 'from-tg400';
  const rawMatch = tg400IdentifyRaw.match(/match\s+:\s+([^\n]+)/i)?.[1]?.trim() || liveForm.tg400Match || '45.128.123.0/24';
  const rawEndpoint = tg400?.endpoint || '20001';
  const rawFromUser = tg400Raw.match(/from_user\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawFromDomain = tg400Raw.match(/from_domain\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawTransport = tg400Raw.match(/transport\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawAllow = tg400Raw.match(/allow\s+:\s*\(([^)]*)\)/i)?.[1]?.replace(/\|/g, ', ') || '—';
  const rawAors = tg400Raw.match(/aors\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawIdentifyBy = tg400Raw.match(/identify_by\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawDtmfMode = tg400Raw.match(/dtmf_mode\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawDirectMedia = tg400Raw.match(/direct_media\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawRtpSymmetric = tg400Raw.match(/rtp_symmetric\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawForceRport = tg400Raw.match(/force_rport\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawRewriteContact = tg400Raw.match(/rewrite_contact\s+:\s*([^\n]*)/i)?.[1]?.trim() || '—';
  const rawState = tg400?.state || t('common.unknown');
  const rawChannels = tg400?.channels || '0 of inf';

  const set = (patch: Partial<AdvancedAsteriskSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div dir={i18n.dir()} className="w-full max-w-full min-w-0 overflow-x-hidden space-y-6 px-2 sm:px-0">
      <PageHeader
        title={t('asterisk.title')}
        subtitle={t('asterisk.subtitle')}
        icon={<Server className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => invalidateAll(qc)}>
              <RefreshCw className="h-4 w-4" />
              {t('common.refresh')}
            </Button>
            {canEdit && (
              <Button variant="outline" onClick={() => reloadPjsipMut.mutate()} disabled={reloadPjsipMut.isPending}>
                <Router className="h-4 w-4" />
                {t('asterisk.reloadPjsip')}
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => reloadDialplanMut.mutate()} disabled={reloadDialplanMut.isPending}>
                <Zap className="h-4 w-4" />
                {t('asterisk.reloadDialplan')}
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => saveMut.mutate(liveForm)} disabled={saveMut.isPending}>
                <Save className="h-4 w-4" />
                {t('asterisk.saveSettings')}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard title={t('asterisk.metrics.ami')} value={status?.ami ?? '—'} ok={status?.ami === 'connected'} icon={<Server className="h-5 w-5" />} />
        <MetricCard title={t('asterisk.contacts.title')} value={contacts.length} ok={contacts.length > 0} icon={<Network className="h-5 w-5" />} />
        <MetricCard title={t('asterisk.endpoints.title')} value={`${registeredEndpoints}/${endpoints.length}`} ok={registeredEndpoints > 0} icon={<Users className="h-5 w-5" />} />
        <MetricCard title={t('asterisk.metrics.activeCalls')} value={channels?.activeCalls ?? 0} neutral icon={<PhoneCall className="h-5 w-5" />} />
        <MetricCard title={t('asterisk.queues.title')} value={queues.length} ok={queues.length > 0} icon={<Activity className="h-5 w-5" />} />
        <MetricCard title={t('asterisk.metrics.uptime')} value={formatDuration(status?.uptimeSec ?? 0)} ok icon={<CircleDot className="h-5 w-5" />} />
      </div>

      <div dir={i18n.dir()} className="flex w-full max-w-full min-w-0 gap-2 overflow-x-auto rounded-xl border bg-card p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ['overview', t('asterisk.tabs.overview')],
          ['settings', t('asterisk.tabs.settings')],
          ['tg400', t('asterisk.tabs.tg400')],
          ['security', t('asterisk.tabs.security')],
          ['contacts', t('asterisk.tabs.contacts')],
          ['endpoints', t('asterisk.tabs.endpoints')],
          ['queues', t('asterisk.tabs.queues')],
          ['channels', t('asterisk.tabs.channels')],
          ['pjsip', t('asterisk.tabs.pjsip')],
          ['console', t('asterisk.tabs.console')],
        ] as Array<[TabKey, string]>).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'ghost'} size="sm" onClick={() => setTab(key)} className="shrink-0 whitespace-nowrap">
            {label}
          </Button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-2">
          <Card className="min-w-0 overflow-hidden xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Router className="h-4 w-4" />
                {t('asterisk.tg400.monitor')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniInfo label={t('asterisk.fields.endpoint')} value={rawEndpoint} />
              <MiniInfo label={t('asterisk.fields.state')} value={rawState} badge />
              <MiniInfo label={t('asterisk.fields.matchRange')} value={rawMatch} />
              <MiniInfo label={t('asterisk.fields.contact')} value={tg400Contact ? `${tg400Contact.host} ${tg400Contact.transport}` : t('asterisk.empty.noTg400Registration')} />
            </CardContent>
          </Card>

          <ContactsTable contacts={contacts.slice(0, 8)} t={t} />
          <EndpointsTable endpoints={endpoints.slice(0, 12)} t={t} />
          <QueuesGrid queues={queues} t={t} />
          <RawOutput title={t('asterisk.raw.registrations')} output={registrationsQ.data?.stdout || ''} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-2">
          <RawOutput title="Live PJSIP Global Settings" output={pjsipSettingsQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Live PJSIP Transports" output={transportsQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Live RTP Settings" output={rtpRawQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Live AMI / Manager Settings" output={managerRawQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Live HTTP / ARI Status" output={httpRawQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Live Core Uptime" output={status?.uptimeSec ? formatDuration(status.uptimeSec) : t('common.loading')} />
        </div>
      )}

      {tab === 'tg400' && (
        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-2">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Router className="h-4 w-4" />
                TG400 Raw Parsed
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <MiniInfo label="Endpoint" value={rawEndpoint} />
              <MiniInfo label="State" value={rawState} badge />
              <MiniInfo label="Channels" value={rawChannels} />
              <MiniInfo label="Context" value={rawContext} />
              <MiniInfo label="AORs" value={rawAors} />
              <MiniInfo label="From User" value={rawFromUser} />
              <MiniInfo label="From Domain" value={rawFromDomain} />
              <MiniInfo label="Match" value={rawMatch} />
              <MiniInfo label="Transport" value={rawTransport} />
              <MiniInfo label="Allow Codecs" value={rawAllow} />
              <MiniInfo label="Identify By" value={rawIdentifyBy} />
              <MiniInfo label="DTMF Mode" value={rawDtmfMode} />
              <MiniInfo label="Direct Media" value={rawDirectMedia} />
              <MiniInfo label="RTP Symmetric" value={rawRtpSymmetric} />
              <MiniInfo label="Force RPort" value={rawForceRport} />
              <MiniInfo label="Rewrite Contact" value={rawRewriteContact} />
            </CardContent>
          </Card>

          <RawOutput title="Raw: pjsip show endpoint 20001" output={tg400Raw || t('common.loading')} />
          <RawOutput title="Raw: pjsip show identify tg400" output={tg400IdentifyRaw || t('common.loading')} />
          <RawOutput title="Raw: pjsip show transports" output={transportsQ.data?.stdout || t('common.loading')} />
          <RawOutput title="Raw: dialplan show from-tg400" output="Use Console: dialplan show from-tg400" />
        </div>
      )}

      {tab === 'security' && (
        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-2">
          <Section title={t('asterisk.sections.pjsipGlobalNat')}>
            <FormRow label={t('asterisk.fields.endpointIdentifierOrder')}>
              <Input value={liveForm.endpointIdentifierOrder ?? 'username,ip,anonymous'} disabled={!canEdit} onChange={(e) => set({ endpointIdentifierOrder: e.target.value })} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label={t('asterisk.fields.externalMediaAddress')}>
                <Input value={liveForm.externalMediaAddress ?? ''} disabled={!canEdit} onChange={(e) => set({ externalMediaAddress: e.target.value })} placeholder="82.39.115.217" />
              </FormRow>
              <FormRow label={t('asterisk.fields.externalSignalingAddress')}>
                <Input value={liveForm.externalSignalingAddress ?? ''} disabled={!canEdit} onChange={(e) => set({ externalSignalingAddress: e.target.value })} placeholder="82.39.115.217" />
              </FormRow>
            </div>
            <FormRow label={t('asterisk.fields.localNetwork')}>
              <Input value={liveForm.localNet ?? ''} disabled={!canEdit} onChange={(e) => set({ localNet: e.target.value })} placeholder="192.168.0.0/16" />
            </FormRow>
          </Section>

          <Section title={t('asterisk.sections.sipFirewallNotes')}>
            <FormRow label={t('asterisk.fields.allowedSipRanges')}>
              <Input value={liveForm.allowedSipRanges ?? '45.128.123.0/24'} disabled={!canEdit} onChange={(e) => set({ allowedSipRanges: e.target.value })} />
            </FormRow>
            <FormRow label={t('asterisk.fields.blockedSipRanges')}>
              <Input value={liveForm.blockedSipRanges ?? '5.135.0.0/16'} disabled={!canEdit} onChange={(e) => set({ blockedSipRanges: e.target.value })} />
            </FormRow>
          </Section>
        </div>
      )}

      {tab === 'contacts' && <ContactsTable contacts={contacts} full t={t} />}
      {tab === 'endpoints' && <EndpointsTable endpoints={endpoints} full t={t} />}
      {tab === 'queues' && <QueuesGrid queues={queues} full t={t} />}
      {tab === 'channels' && <RawOutput title={t('asterisk.raw.liveChannels')} output={channels?.raw || t('asterisk.empty.noChannelsOutput')} />}

      {tab === 'pjsip' && (
        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-2">
          <RawOutput title={t('asterisk.raw.pjsipGlobalSettings')} output={pjsipSettingsQ.data?.stdout || t('common.loading')} />
          <RawOutput title={t('asterisk.raw.transports')} output={transportsQ.data?.stdout || t('common.loading')} />
          <RawOutput title={t('asterisk.raw.registrations')} output={registrationsQ.data?.stdout || t('common.loading')} />
        </div>
      )}

      {tab === 'console' && (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4" />
              {t('asterisk.console.safeTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {safeCommands.map((cmd) => (
                <Button key={cmd} variant="outline" size="sm" onClick={() => setCommand(cmd)}>
                  {cmd}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="pjsip show contacts" disabled={!canEdit} />
              <Button disabled={!canEdit || cliMut.isPending} onClick={() => cliMut.mutate(command)}>
                {cliMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TerminalSquare className="h-4 w-4" />}
                {t('asterisk.console.execute')}
              </Button>
              {canEdit && (
                <Button variant="outline" onClick={() => reloadConfigMut.mutate()} disabled={reloadConfigMut.isPending}>
                  <Settings className="h-4 w-4" />
                  {t('asterisk.reloadConfig')}
                </Button>
              )}
            </div>
            <RawOutput title={t('asterisk.raw.output')} output={cliOutput || t('asterisk.console.chooseCommand')} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['asterisk-status'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-contacts-json'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-endpoints-json'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-queues-json'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-channels-json'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-pjsip-settings'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-transports'] });
  void qc.invalidateQueries({ queryKey: ['asterisk-registrations'] });
}

function MetricCard({ title, value, ok, neutral, icon }: { title: string; value: string | number; ok?: boolean; neutral?: boolean; icon: ReactNode }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="min-h-[104px] flex flex-col items-start justify-between gap-2 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="truncate text-xl font-bold capitalize leading-tight">{value}</p>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          <span className="text-muted-foreground">{icon}</span>
          {!neutral && (ok ? <CheckCircle2 className="h-6 w-6 text-success" /> : <XCircle className="h-6 w-6 text-destructive" />)}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniInfo({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {badge ? <StatusBadgeText text={value} /> : <p className="mt-1 break-all font-semibold">{value}</p>}
    </div>
  );
}

function MiniNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ContactsTable({ contacts, full, t }: { contacts: asteriskApi.AsteriskContactJson[]; full?: boolean; t: (key: string) => string }) {
  return (
    <Card className={full ? "min-w-0 overflow-hidden" : "min-w-0 overflow-hidden xl:col-span-1"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" />
          SIP Contacts
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {contacts.length === 0 ? (
          <Empty text={t('asterisk.empty.noContacts')} />
        ) : (
          <div className="w-full max-w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[520px] max-w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">{t('asterisk.contacts.aor')}</th>
                  <th className="py-2 text-left">{t('asterisk.contacts.user')}</th>
                  <th className="py-2 text-left">{t('asterisk.contacts.host')}</th>
                  <th className="py-2 text-left">{t('asterisk.contacts.transport')}</th>
                  <th className="py-2 text-left">{t('asterisk.contacts.status')}</th>
                  <th className="py-2 text-left">{t('asterisk.contacts.rtt')}</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={`${c.aor}-${c.host}`} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{c.aor}</td>
                    <td className="py-2">{c.user}</td>
                    <td className="max-w-[260px] truncate py-2">{c.host}</td>
                    <td className="py-2">{c.transport || '—'}</td>
                    <td className="py-2"><StatusBadgeText text={c.status} /></td>
                    <td className="py-2">{c.rtt ? `${Number(c.rtt).toFixed(0)} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EndpointsTable({ endpoints, full, t }: { endpoints: asteriskApi.AsteriskEndpointJson[]; full?: boolean; t: (key: string) => string }) {
  return (
    <Card className={full ? "min-w-0 overflow-hidden" : "min-w-0 overflow-hidden xl:col-span-1"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Endpoints
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {endpoints.length === 0 ? (
          <Empty text={t('asterisk.empty.noEndpoints')} />
        ) : (
          <div className="w-full max-w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[420px] max-w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">{t('asterisk.endpoints.endpoint')}</th>
                  <th className="py-2 text-left">{t('asterisk.endpoints.state')}</th>
                  <th className="py-2 text-left">{t('asterisk.endpoints.channels')}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.endpoint} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{e.endpoint}</td>
                    <td className="py-2"><StatusBadgeText text={e.state} /></td>
                    <td className="py-2">{e.channels}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueuesGrid({ queues, full, t }: { queues: asteriskApi.AsteriskQueueJson[]; full?: boolean; t: (key: string) => string }) {
  return (
    <Card className={full ? "min-w-0 overflow-hidden" : "min-w-0 overflow-hidden xl:col-span-2"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Queues
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {queues.length === 0 ? (
          <Empty text={t('asterisk.empty.noQueues')} />
        ) : (
          <div className="grid w-full min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {queues.map((q) => (
              <div key={q.queue} className="min-w-0 overflow-hidden rounded-xl border bg-background/40 p-4">
                <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-lg font-bold">{q.queue}</p>
                  <Badge variant={q.calls > 0 ? 'default' : 'secondary'}>{q.calls} {t('asterisk.queues.calls')}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniNumber label={t('asterisk.queues.members')} value={q.members} />
                  <MiniNumber label={t('asterisk.queues.waiting')} value={q.callers} />
                  <MiniNumber label={t('asterisk.queues.calls')} value={q.calls} />
                </div>
                <p className="mt-3 truncate text-xs text-muted-foreground">{t('asterisk.queues.strategy')}: {q.strategy}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RawOutput({ title, output }: { title: string; output: string }) {
  return (
    <Card className="min-w-0 overflow-hidden xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        <pre className="max-h-[520px] overflow-auto rounded-xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {output || 'No output'}
        </pre>
      </CardContent>
    </Card>
  );
}

function StatusBadgeText({ text }: { text: string }) {
  const value = text || 'Unknown';
  const good = /avail|not in use|connected|ok/i.test(value);
  const bad = /unavail|offline|failed|disconnected|unknown/i.test(value);

  return (
    <Badge variant={good ? 'default' : bad ? 'destructive' : 'secondary'} className="capitalize">
      {value}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
