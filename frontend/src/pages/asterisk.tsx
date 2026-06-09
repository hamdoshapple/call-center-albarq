import { useEffect, useMemo, useState } from 'react';
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
  Shield,
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

  useEffect(() => {
    if (settingsQ.data) setForm(settingsQ.data as AdvancedAsteriskSettings);
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: (s: AdvancedAsteriskSettings) => asteriskApi.updateAsteriskSettings(s as AsteriskSettings),
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Asterisk settings were saved successfully.' });
      void qc.invalidateQueries({ queryKey: ['asterisk-settings'] });
    },
  });

  const reloadPjsipMut = useMutation({
    mutationFn: asteriskApi.reloadPjsip,
    onSuccess: () => {
      toast({ title: 'PJSIP reloaded', description: 'Asterisk accepted pjsip reload.' });
      invalidateAll(qc);
    },
  });

  const reloadDialplanMut = useMutation({
    mutationFn: asteriskApi.reloadDialplan,
    onSuccess: () => {
      toast({ title: 'Dialplan reloaded', description: 'Asterisk accepted dialplan reload.' });
      invalidateAll(qc);
    },
  });

  const reloadConfigMut = useMutation({
    mutationFn: asteriskApi.reloadConfig,
    onSuccess: () => {
      toast({ title: 'Config reloaded', description: 'Asterisk config reload command completed.' });
      invalidateAll(qc);
    },
  });

  const cliMut = useMutation({
    mutationFn: asteriskApi.runAsteriskCli,
    onSuccess: (r) => setCliOutput(r.stdout || r.stderr || 'No output'),
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

  if (settingsQ.isLoading || !form) return <Loader />;

  const set = (patch: Partial<AdvancedAsteriskSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asterisk PBX"
        subtitle="Monitor, settings, TG400 trunk, PJSIP, security and console"
        icon={<Server className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => invalidateAll(qc)}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {canEdit && (
              <Button variant="outline" onClick={() => reloadPjsipMut.mutate()} disabled={reloadPjsipMut.isPending}>
                <Router className="h-4 w-4" />
                Reload PJSIP
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => reloadDialplanMut.mutate()} disabled={reloadDialplanMut.isPending}>
                <Zap className="h-4 w-4" />
                Reload Dialplan
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
                <Save className="h-4 w-4" />
                Save Settings
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="AMI" value={status?.ami ?? '—'} ok={status?.ami === 'connected'} icon={<Server className="h-5 w-5" />} />
        <MetricCard title="SIP Contacts" value={contacts.length} ok={contacts.length > 0} icon={<Network className="h-5 w-5" />} />
        <MetricCard title="Endpoints" value={`${registeredEndpoints}/${endpoints.length}`} ok={registeredEndpoints > 0} icon={<Users className="h-5 w-5" />} />
        <MetricCard title="Active Calls" value={channels?.activeCalls ?? 0} neutral icon={<PhoneCall className="h-5 w-5" />} />
        <MetricCard title="Queues" value={queues.length} ok={queues.length > 0} icon={<Activity className="h-5 w-5" />} />
        <MetricCard title="Uptime" value={formatDuration(status?.uptimeSec ?? 0)} ok icon={<CircleDot className="h-5 w-5" />} />
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-2">
        {([
          ['overview', 'Overview'],
          ['settings', 'Settings'],
          ['tg400', 'TG400'],
          ['security', 'Security'],
          ['contacts', 'Contacts'],
          ['endpoints', 'Endpoints'],
          ['queues', 'Queues'],
          ['channels', 'Channels'],
          ['pjsip', 'PJSIP'],
          ['console', 'Console'],
        ] as Array<[TabKey, string]>).map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'ghost'} size="sm" onClick={() => setTab(key)} className="whitespace-nowrap">
            {label}
          </Button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Router className="h-4 w-4" />
                TG400 Monitor
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <MiniInfo label="Endpoint" value={tg400?.endpoint || form.tg400Endpoint || '20001'} />
              <MiniInfo label="State" value={tg400?.state || 'Unknown'} badge />
              <MiniInfo label="Match Range" value={form.tg400Match || '45.128.123.0/24'} />
              <MiniInfo label="Contact" value={tg400Contact ? `${tg400Contact.host} ${tg400Contact.transport}` : 'No TG400 registration'} />
            </CardContent>
          </Card>

          <ContactsTable contacts={contacts.slice(0, 8)} />
          <EndpointsTable endpoints={endpoints.slice(0, 12)} />
          <QueuesGrid queues={queues} />
          <RawOutput title="Registrations" output={registrationsQ.data?.stdout || ''} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Server">
            <FormRow label="Server IP">
              <Input value={form.serverIp} disabled={!canEdit} onChange={(e) => set({ serverIp: e.target.value })} />
            </FormRow>
            <FormRow label="SIP Port">
              <Input type="number" value={form.sipPort} disabled={!canEdit} onChange={(e) => set({ sipPort: Number(e.target.value) })} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="RTP Start">
                <Input type="number" value={form.rtpStart} disabled={!canEdit} onChange={(e) => set({ rtpStart: Number(e.target.value) })} />
              </FormRow>
              <FormRow label="RTP End">
                <Input type="number" value={form.rtpEnd} disabled={!canEdit} onChange={(e) => set({ rtpEnd: Number(e.target.value) })} />
              </FormRow>
            </div>
          </Section>

          <Section title="AMI / ARI">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="AMI Host">
                <Input value={form.amiHost} disabled={!canEdit} onChange={(e) => set({ amiHost: e.target.value })} />
              </FormRow>
              <FormRow label="AMI Port">
                <Input type="number" value={form.amiPort} disabled={!canEdit} onChange={(e) => set({ amiPort: Number(e.target.value) })} />
              </FormRow>
            </div>
            <FormRow label="AMI User">
              <Input value={form.amiUser} disabled={!canEdit} onChange={(e) => set({ amiUser: e.target.value })} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="ARI Host">
                <Input value={form.ariHost} disabled={!canEdit} onChange={(e) => set({ ariHost: e.target.value })} />
              </FormRow>
              <FormRow label="ARI Port">
                <Input type="number" value={form.ariPort} disabled={!canEdit} onChange={(e) => set({ ariPort: Number(e.target.value) })} />
              </FormRow>
            </div>
            <FormRow label="ARI User">
              <Input value={form.ariUser} disabled={!canEdit} onChange={(e) => set({ ariUser: e.target.value })} />
            </FormRow>
          </Section>

          <Section title="Extensions & Recordings">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Extension Start">
                <Input type="number" value={form.extensionStart} disabled={!canEdit} onChange={(e) => set({ extensionStart: Number(e.target.value) })} />
              </FormRow>
              <FormRow label="Extension End">
                <Input type="number" value={form.extensionEnd} disabled={!canEdit} onChange={(e) => set({ extensionEnd: Number(e.target.value) })} />
              </FormRow>
            </div>
            <FormRow label="Recording Path">
              <Input value={form.recordingPath} disabled={!canEdit} onChange={(e) => set({ recordingPath: e.target.value })} />
            </FormRow>
            <FormRow label="Codecs">
              <Input value={form.codecs.join(',')} disabled={!canEdit} onChange={(e) => set({ codecs: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </FormRow>
          </Section>

          <Section title="Config Files">
            <FormRow label="pjsip.conf">
              <Input value={form.pjsipConfPath ?? '/etc/asterisk/pjsip.conf'} disabled={!canEdit} onChange={(e) => set({ pjsipConfPath: e.target.value })} />
            </FormRow>
            <FormRow label="extensions.conf">
              <Input value={form.extensionsConfPath ?? '/etc/asterisk/extensions.conf'} disabled={!canEdit} onChange={(e) => set({ extensionsConfPath: e.target.value })} />
            </FormRow>
          </Section>
        </div>
      )}

      {tab === 'tg400' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="TG400 Trunk Settings">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Endpoint">
                <Input value={form.tg400Endpoint ?? '20001'} disabled={!canEdit} onChange={(e) => set({ tg400Endpoint: e.target.value })} />
              </FormRow>
              <FormRow label="Context">
                <Input value={form.tg400Context ?? 'from-tg400'} disabled={!canEdit} onChange={(e) => set({ tg400Context: e.target.value })} />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Username">
                <Input value={form.tg400Username ?? '20001'} disabled={!canEdit} onChange={(e) => set({ tg400Username: e.target.value })} />
              </FormRow>
              <FormRow label="Password">
                <Input type="password" value={form.tg400Password ?? ''} disabled={!canEdit} onChange={(e) => set({ tg400Password: e.target.value })} />
              </FormRow>
            </div>
            <FormRow label="Match IP / Range">
              <Input value={form.tg400Match ?? '45.128.123.0/24'} disabled={!canEdit} onChange={(e) => set({ tg400Match: e.target.value })} />
            </FormRow>
            <FormRow label="Trunk Host">
              <Input value={form.trunkHost} disabled={!canEdit} onChange={(e) => set({ trunkHost: e.target.value })} />
            </FormRow>
            <FormRow label="Transport">
              <Input value={form.tg400Transport ?? 'udp,tcp'} disabled={!canEdit} onChange={(e) => set({ tg400Transport: e.target.value })} />
            </FormRow>
          </Section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">TG400 Live State</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <MiniInfo label="Endpoint" value={tg400?.endpoint || '20001'} />
              <MiniInfo label="State" value={tg400?.state || 'Unknown'} badge />
              <MiniInfo label="Registered Contact" value={tg400Contact ? `${tg400Contact.host} ${tg400Contact.transport}` : 'No registration'} />
              <MiniInfo label="Channels" value={tg400?.channels || '0 of inf'} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="PJSIP Global / NAT">
            <FormRow label="Endpoint Identifier Order">
              <Input value={form.endpointIdentifierOrder ?? 'username,ip,anonymous'} disabled={!canEdit} onChange={(e) => set({ endpointIdentifierOrder: e.target.value })} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="External Media Address">
                <Input value={form.externalMediaAddress ?? ''} disabled={!canEdit} onChange={(e) => set({ externalMediaAddress: e.target.value })} placeholder="82.39.115.217" />
              </FormRow>
              <FormRow label="External Signaling Address">
                <Input value={form.externalSignalingAddress ?? ''} disabled={!canEdit} onChange={(e) => set({ externalSignalingAddress: e.target.value })} placeholder="82.39.115.217" />
              </FormRow>
            </div>
            <FormRow label="Local Network">
              <Input value={form.localNet ?? ''} disabled={!canEdit} onChange={(e) => set({ localNet: e.target.value })} placeholder="192.168.0.0/16" />
            </FormRow>
          </Section>

          <Section title="SIP Firewall Notes">
            <FormRow label="Allowed SIP Ranges">
              <Input value={form.allowedSipRanges ?? '45.128.123.0/24'} disabled={!canEdit} onChange={(e) => set({ allowedSipRanges: e.target.value })} />
            </FormRow>
            <FormRow label="Blocked SIP Ranges">
              <Input value={form.blockedSipRanges ?? '5.135.0.0/16'} disabled={!canEdit} onChange={(e) => set({ blockedSipRanges: e.target.value })} />
            </FormRow>
          </Section>
        </div>
      )}

      {tab === 'contacts' && <ContactsTable contacts={contacts} full />}
      {tab === 'endpoints' && <EndpointsTable endpoints={endpoints} full />}
      {tab === 'queues' && <QueuesGrid queues={queues} full />}
      {tab === 'channels' && <RawOutput title="Live Channels" output={channels?.raw || 'No channels output'} />}

      {tab === 'pjsip' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <RawOutput title="PJSIP Global Settings" output={pjsipSettingsQ.data?.stdout || 'Loading...'} />
          <RawOutput title="Transports" output={transportsQ.data?.stdout || 'Loading...'} />
          <RawOutput title="Registrations" output={registrationsQ.data?.stdout || 'Loading...'} />
        </div>
      )}

      {tab === 'console' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4" />
              Safe Asterisk Console
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
                Execute
              </Button>
              {canEdit && (
                <Button variant="outline" onClick={() => reloadConfigMut.mutate()} disabled={reloadConfigMut.isPending}>
                  <Settings className="h-4 w-4" />
                  Reload Config
                </Button>
              )}
            </div>
            <RawOutput title="Output" output={cliOutput || 'Choose a command and press Execute.'} />
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
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="truncate text-lg font-bold capitalize">{value}</p>
        </div>
        <div className="flex items-center gap-2">
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

function ContactsTable({ contacts, full }: { contacts: asteriskApi.AsteriskContactJson[]; full?: boolean }) {
  return (
    <Card className={full ? '' : 'xl:col-span-1'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" />
          SIP Contacts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <Empty text="No SIP contacts registered." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">AOR</th>
                  <th className="py-2 text-left">User</th>
                  <th className="py-2 text-left">Host</th>
                  <th className="py-2 text-left">Transport</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">RTT</th>
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

function EndpointsTable({ endpoints, full }: { endpoints: asteriskApi.AsteriskEndpointJson[]; full?: boolean }) {
  return (
    <Card className={full ? '' : 'xl:col-span-1'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Endpoints
        </CardTitle>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <Empty text="No endpoints found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Endpoint</th>
                  <th className="py-2 text-left">State</th>
                  <th className="py-2 text-left">Channels</th>
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

function QueuesGrid({ queues, full }: { queues: asteriskApi.AsteriskQueueJson[]; full?: boolean }) {
  return (
    <Card className={full ? '' : 'xl:col-span-2'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Queues
        </CardTitle>
      </CardHeader>
      <CardContent>
        {queues.length === 0 ? (
          <Empty text="No queues found." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {queues.map((q) => (
              <div key={q.queue} className="rounded-xl border bg-background/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-lg font-bold">{q.queue}</p>
                  <Badge variant={q.calls > 0 ? 'default' : 'secondary'}>{q.calls} calls</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniNumber label="Members" value={q.members} />
                  <MiniNumber label="Waiting" value={q.callers} />
                  <MiniNumber label="Calls" value={q.calls} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Strategy: {q.strategy}</p>
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
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
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
    <Card>
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
