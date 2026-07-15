import { useEffect, useMemo, useState } from 'react';
import {
  Link2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Settings2,
  Clock,
  TimerReset,
  SendHorizontal,
  KeyRound,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function token() {
  return localStorage.getItem('cc_token') || '';
}

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

function n(v: any) {
  return Number(v || 0).toLocaleString('en-US');
}

function statusText(v: any) {
  const s = String(v || '');
  if (s === 'connected') return 'متصل';
  if (s === 'qr') return 'بانتظار QR';
  if (s === 'starting') return 'جاري التشغيل';
  if (s === 'connecting') return 'جاري الاتصال';
  if (s === 'disconnected') return 'مفصول';
  if (s === 'error') return 'خطأ';
  return s || 'غير معروف';
}

export default function WhatsappPage() {
  const { toast } = useToast();

  const [sessions, setSessions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeId, setActiveId] = useState('');
  const [name, setName] = useState('');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pairPhone, setPairPhone] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('مرحباً {rand:عزيز المشترك|أهلاً وسهلاً|تحية طيبة}، هذه رسالة تجربة من البرق الرقمي.');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => sessions.find((x) => x.sessionId === activeId), [sessions, activeId]);


  const [delayMin, setDelayMin] = useState('5');
  const [delayMax, setDelayMax] = useState('15');
  const [dailyLimit, setDailyLimit] = useState('200');
  const [activeSend, setActiveSend] = useState(true);

  const [queueMaxFailedToday, setQueueMaxFailedToday] = useState('10');
  const [queueMaxFailRate, setQueueMaxFailRate] = useState('15');
  const [queueWindowHours, setQueueWindowHours] = useState('24');
  const [savingQueue, setSavingQueue] = useState(false);
  const [queueMode, setQueueMode] = useState('balanced');
  const [fingerprintEnabled, setFingerprintEnabled] = useState(true);
  const [uniqueMessageEnabled, setUniqueMessageEnabled] = useState(true);
  const [fingerprintMinLetters, setFingerprintMinLetters] = useState('2');
  const [fingerprintMaxLetters, setFingerprintMaxLetters] = useState('3');
  const [fingerprintMinDigits, setFingerprintMinDigits] = useState('1000');
  const [fingerprintMaxDigits, setFingerprintMaxDigits] = useState('9999');
  const [fingerprintLabels, setFingerprintLabels] = useState('رمز المتابعة,مرجع الخدمة,رقم العملية,رقم الطلب,كود الخدمة,معرّف الرسالة');
  const [extraDelayEvery, setExtraDelayEvery] = useState('20');
  const [extraDelaySeconds, setExtraDelaySeconds] = useState('60');
  const [warmupEnabled, setWarmupEnabled] = useState(true);
  const [warmupHours, setWarmupHours] = useState('72');
  const [warmupDailyLimit, setWarmupDailyLimit] = useState('30');
  const [cooldownEnabled, setCooldownEnabled] = useState(true);
  const [cooldownMinutes, setCooldownMinutes] = useState('30');
  const [mainTab, setMainTab] = useState('whatsapp');

  const [tgSessions, setTgSessions] = useState<any[]>([]);
  const [tgLogs, setTgLogs] = useState<any[]>([]);
  const [tgActiveId, setTgActiveId] = useState('');
  const tgActive = useMemo(() => tgSessions.find((x) => x.sessionId === tgActiveId), [tgSessions, tgActiveId]);
  const [tgName, setTgName] = useState('');
  const [tgQrImage, setTgQrImage] = useState<string | null>(null);
  const [tgTo, setTgTo] = useState('');
  const [tgMessage, setTgMessage] = useState('مرحباً، هذه رسالة تجربة من تليكرام البرق الرقمي.');
  const [tgApiId, setTgApiId] = useState('');
  const [tgApiHash, setTgApiHash] = useState('');
  const [tgHasApiHash, setTgHasApiHash] = useState(false);
  const [tgDelayMin, setTgDelayMin] = useState('5');
  const [tgDelayMax, setTgDelayMax] = useState('15');
  const [tgDailyLimit, setTgDailyLimit] = useState('200');
  const [tgActiveSend, setTgActiveSend] = useState(true);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgSaving, setTgSaving] = useState(false);



  async function load() {
    const s = await api('/whatsapp/sessions');
    const list = s.sessions || [];
    setSessions(list);

    if (!activeId && list[0]?.sessionId) setActiveId(list[0].sessionId);

    const l = await api('/whatsapp/logs').catch(() => ({ logs: [] }));
    setLogs(l.logs || []);

    const tgApi = await api('/telegram/api-settings').catch(() => null);
    if (tgApi) {
      setTgApiId(String(tgApi.apiId || ''));
      setTgApiHash(String(tgApi.apiHash || ''));
      setTgHasApiHash(!!tgApi.hasApiHash);
    }

    const tgS = await api('/telegram/sessions').catch(() => ({ sessions: [] }));
    const tgList = tgS.sessions || [];
    setTgSessions(tgList);
    if (!tgActiveId && tgList[0]?.sessionId) setTgActiveId(tgList[0].sessionId);

    const tgL = await api('/telegram/logs').catch(() => ({ logs: [] }));
    setTgLogs(tgL.logs || []);

    const q = await api('/whatsapp/queue-settings').catch(() => null);
    if (q) {
      setQueueMaxFailedToday(String(q.maxFailedToday ?? 10));
      setQueueMaxFailRate(String(q.maxFailRate ?? 15));
      setQueueWindowHours(String(q.windowHours ?? 24));
      setQueueMode(String(q.queueMode ?? 'balanced'));
      setFingerprintEnabled(q.fingerprintEnabled !== false);
      setUniqueMessageEnabled(q.uniqueMessageEnabled !== false);
      setFingerprintMinLetters(String(q.fingerprintMinLetters ?? 2));
      setFingerprintMaxLetters(String(q.fingerprintMaxLetters ?? 3));
      setFingerprintMinDigits(String(q.fingerprintMinDigits ?? 1000));
      setFingerprintMaxDigits(String(q.fingerprintMaxDigits ?? 9999));
      setFingerprintLabels(Array.isArray(q.fingerprintLabels) ? q.fingerprintLabels.join(',') : String(q.fingerprintLabels || 'رمز المتابعة,مرجع الخدمة,رقم العملية,رقم الطلب,كود الخدمة,معرّف الرسالة'));
      setExtraDelayEvery(String(q.extraDelayEvery ?? 20));
      setExtraDelaySeconds(String(q.extraDelaySeconds ?? 60));
      setWarmupEnabled(q.warmupEnabled !== false);
      setWarmupHours(String(q.warmupHours ?? 72));
      setWarmupDailyLimit(String(q.warmupDailyLimit ?? 30));
      setCooldownEnabled(q.cooldownEnabled !== false);
      setCooldownMinutes(String(q.cooldownMinutes ?? 30));
    }
  }

  async function refreshSession(id = activeId) {
    if (!id) return;
    const st = await api(`/whatsapp/sessions/${id}/status`);
    if (st.status === 'qr' || st.hasQr) {
      const q = await api(`/whatsapp/sessions/${id}/qr`);
      setQrImage(q.qrImage || null);
    } else {
      setQrImage(null);
    }
    await load();
  }

  async function startNew() {
    setLoading(true);
    setQrImage(null);
    setPairCode('');

    try {
      const data = await api('/whatsapp/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ name: name || undefined }),
      });
      setActiveId(data.session.sessionId);
      toast({ title: 'تم إنشاء جلسة جديدة' });
      setTimeout(() => refreshSession(data.session.sessionId), 1200);
    } catch (e: any) {
      toast({ title: 'فشل إنشاء الجلسة', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function reconnect() {
    if (!activeId) return toast({ title: 'اختر جلسة أولاً', variant: 'destructive' });

    setLoading(true);
    setQrImage(null);
    setPairCode('');

    try {
      const data = await api('/whatsapp/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ name: name || active?.name || undefined, sessionId: activeId, force: true }),
      });
      setActiveId(data.session.sessionId);
      toast({ title: 'تمت إعادة الربط' });
      setTimeout(() => refreshSession(data.session.sessionId), 1200);
    } catch (e: any) {
      toast({ title: 'فشل إعادة الربط', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!activeId) return toast({ title: 'اختر جلسة أولاً', variant: 'destructive' });

    setSaving(true);
    try {
      await api('/whatsapp/sessions/settings', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeId,
          delayMin: Number(delayMin || 5),
          delayMax: Number(delayMax || 15),
          dailyLimit: Number(dailyLimit || 200),
          active: activeSend,
        }),
      });
      toast({ title: 'تم حفظ إعدادات الستاندباي' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل الحفظ', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function saveQueueSettings() {
    setSavingQueue(true);
    try {
      await api('/whatsapp/queue-settings', {
        method: 'POST',
        body: JSON.stringify({
          maxFailedToday: Number(queueMaxFailedToday || 10),
          maxFailRate: Number(queueMaxFailRate || 15),
          windowHours: Number(queueWindowHours || 24),
          queueMode,
          fingerprintEnabled,
          uniqueMessageEnabled,
          fingerprintMinLetters: Number(fingerprintMinLetters || 2),
          fingerprintMaxLetters: Number(fingerprintMaxLetters || 3),
          fingerprintMinDigits: Number(fingerprintMinDigits || 1000),
          fingerprintMaxDigits: Number(fingerprintMaxDigits || 9999),
          fingerprintLabels: fingerprintLabels.split(',').map((x) => x.trim()).filter(Boolean),
          extraDelayEvery: Number(extraDelayEvery || 20),
          extraDelaySeconds: Number(extraDelaySeconds || 60),
          warmupEnabled,
          warmupHours: Number(warmupHours || 72),
          warmupDailyLimit: Number(warmupDailyLimit || 30),
          cooldownEnabled,
          cooldownMinutes: Number(cooldownMinutes || 30),
        }),
      });

      toast({ title: 'تم حفظ إعدادات توزيع الرسائل' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل حفظ إعدادات التوزيع', description: e.message, variant: 'destructive' });
    } finally {
      setSavingQueue(false);
    }
  }

  async function logout() {
    if (!activeId) return;
    const id = activeId;
    if (!confirm('متأكد تريد حذف هذه الجلسة نهائياً من القائمة؟')) return;

    try {
      await api(`/whatsapp/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((x) => x.sessionId !== id));
      setQrImage(null);
      setPairCode('');
      setActiveId('');
      toast({ title: 'تم حذف الجلسة نهائياً' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل حذف الجلسة', description: e.message, variant: 'destructive' });
    }
  }

  async function pair() {
    if (!activeId) return toast({ title: 'اختر جلسة أولاً', variant: 'destructive' });
    if (!pairPhone.trim()) return toast({ title: 'اكتب رقم الواتساب', variant: 'destructive' });

    try {
      const data = await api(`/whatsapp/sessions/${activeId}/pair-code`, {
        method: 'POST',
        body: JSON.stringify({ phone: pairPhone }),
      });
      setPairCode(data.code || '');
      toast({ title: data.connected ? 'الجلسة متصلة مسبقاً' : 'تم إنشاء كود الربط' });
    } catch (e: any) {
      toast({ title: 'فشل كود الربط', description: e.message, variant: 'destructive' });
    }
  }


  async function saveTelegramApi() {
    if (!tgApiId.trim() || !tgApiHash.trim()) {
      return toast({ title: 'اكتب API ID و API HASH', variant: 'destructive' });
    }

    setTgSaving(true);
    try {
      await api('/telegram/api-settings', {
        method: 'POST',
        body: JSON.stringify({ apiId: tgApiId, apiHash: tgApiHash }),
      });
      setTgHasApiHash(true);
      toast({ title: 'تم حفظ إعدادات Telegram API' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل حفظ إعدادات تليكرام', description: e.message, variant: 'destructive' });
    } finally {
      setTgSaving(false);
    }
  }

  async function refreshTelegramSession(id = tgActiveId) {
    if (!id) return;
    const st = await api(`/telegram/sessions/${id}/status`);
    if (st.status === 'qr' || st.hasQr) {
      const q = await api(`/telegram/sessions/${id}/qr`);
      setTgQrImage(q.qrImage || null);
    } else {
      setTgQrImage(null);
    }
    await load();
  }

  async function startTelegramNew() {
    setTgLoading(true);
    setTgQrImage(null);

    try {
      const data = await api('/telegram/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ name: tgName || undefined }),
      });
      setTgActiveId(data.session.sessionId);
      toast({ title: 'تم إنشاء جلسة تليكرام' });
      setTimeout(() => refreshTelegramSession(data.session.sessionId), 1200);
    } catch (e: any) {
      toast({ title: 'فشل إنشاء جلسة تليكرام', description: e.message, variant: 'destructive' });
    } finally {
      setTgLoading(false);
    }
  }

  async function reconnectTelegram() {
    if (!tgActiveId) return toast({ title: 'اختر جلسة تليكرام أولاً', variant: 'destructive' });

    setTgLoading(true);
    setTgQrImage(null);

    try {
      const data = await api('/telegram/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ name: tgName || tgActive?.name || undefined, sessionId: tgActiveId, force: true }),
      });
      setTgActiveId(data.session.sessionId);
      toast({ title: 'تمت إعادة ربط تليكرام' });
      setTimeout(() => refreshTelegramSession(data.session.sessionId), 1200);
    } catch (e: any) {
      toast({ title: 'فشل إعادة الربط', description: e.message, variant: 'destructive' });
    } finally {
      setTgLoading(false);
    }
  }

  async function saveTelegramSessionSettings() {
    if (!tgActiveId) return toast({ title: 'اختر جلسة تليكرام أولاً', variant: 'destructive' });

    setTgSaving(true);
    try {
      await api('/telegram/sessions/settings', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: tgActiveId,
          delayMin: Number(tgDelayMin || 5),
          delayMax: Number(tgDelayMax || 15),
          dailyLimit: Number(tgDailyLimit || 200),
          active: tgActiveSend,
        }),
      });
      toast({ title: 'تم حفظ إعدادات جلسة تليكرام' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل الحفظ', description: e.message, variant: 'destructive' });
    } finally {
      setTgSaving(false);
    }
  }

  async function deleteTelegramSession() {
    if (!tgActiveId) return;
    const id = tgActiveId;
    if (!confirm('متأكد تريد حذف جلسة تليكرام نهائياً؟')) return;

    try {
      await api(`/telegram/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setTgSessions((prev) => prev.filter((x) => x.sessionId !== id));
      setTgQrImage(null);
      setTgActiveId('');
      toast({ title: 'تم حذف جلسة تليكرام' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل حذف جلسة تليكرام', description: e.message, variant: 'destructive' });
    }
  }

  async function sendTelegramTest() {
    if (!tgTo.trim() || !tgMessage.trim()) return toast({ title: 'اكتب الرقم والرسالة', variant: 'destructive' });

    try {
      await api('/telegram/send', {
        method: 'POST',
        body: JSON.stringify({ to: tgTo, message: tgMessage, sessionId: tgActiveId || undefined }),
      });
      toast({ title: 'تم إرسال تجربة تليكرام' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل إرسال تليكرام', description: e.message, variant: 'destructive' });
    }
  }

  async function sendTest() {
    if (!to.trim() || !message.trim()) return toast({ title: 'اكتب الرقم والرسالة', variant: 'destructive' });

    try {
      await api('/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ to, message, sessionId: activeId || undefined }),
      });
      toast({ title: 'تم إرسال التجربة / أو دخلت بالطابور' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل الإرسال', description: e.message, variant: 'destructive' });
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!active) return;
    setDelayMin(String(active.delayMin ?? 5));
    setDelayMax(String(active.delayMax ?? 15));
    setDailyLimit(String(active.dailyLimit ?? 200));
    setActiveSend(active.active !== false);
  }, [activeId, active?.updatedAt]);

  useEffect(() => {
    if (!tgActive) return;
    setTgDelayMin(String(tgActive.delayMin ?? 5));
    setTgDelayMax(String(tgActive.delayMax ?? 15));
    setTgDailyLimit(String(tgActive.dailyLimit ?? 200));
    setTgActiveSend(tgActive.active !== false);
  }, [tgActiveId, tgActive?.updatedAt]);

  const connected = sessions.filter((x) => x.status === 'connected' && x.active !== false).length;
  const sentToday = sessions.reduce((sum, x) => sum + Number(x.sentToday || 0), 0);
  const failedToday = sessions.reduce((sum, x) => sum + Number(x.failedToday || 0), 0);

  const tgConnected = tgSessions.filter((x) => x.status === 'connected' && x.active !== false).length;
  const tgSentToday = tgSessions.reduce((sum, x) => sum + Number(x.sentToday || 0), 0);
  const tgFailedToday = tgSessions.reduce((sum, x) => sum + Number(x.failedToday || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="قنوات الرسائل" />

      <div className="rounded-[28px] border bg-gradient-to-l from-emerald-500/15 via-background to-background p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black">واتساب متعدد الجلسات</h1>
              <p className="text-sm text-muted-foreground">
                توزيع تلقائي بين الجلسات + Standby بين كل رسالة والثانية.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">متصل {n(connected)}</Badge>
            <Badge variant="outline">مرسل اليوم {n(sentToday)}</Badge>
            <Badge variant={failedToday ? 'destructive' : 'outline'}>فشل {n(failedToday)}</Badge>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2">
          <TabsTrigger value="whatsapp" className="rounded-xl">واتساب</TabsTrigger>
          <TabsTrigger value="telegram" className="rounded-xl">تليكرام</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr_380px]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>الجلسات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="اسم الجلسة الجديدة"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={startNew} disabled={loading}>
                <Link2 className="ml-2 h-4 w-4" />
                إضافة جلسة
              </Button>
              <Button variant="outline" onClick={reconnect} disabled={loading || !activeId}>
                إعادة ربط
              </Button>
            </div>

            <Button variant="outline" className="w-full" onClick={() => activeId && refreshSession(activeId)} disabled={!activeId}>
              <RefreshCw className="ml-2 h-4 w-4" />
              تحديث الحالة
            </Button>

            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  type="button"
                  onClick={() => { setActiveId(s.sessionId); setTimeout(() => refreshSession(s.sessionId), 200); }}
                  className={`w-full rounded-2xl border p-3 text-start transition ${
                    activeId === s.sessionId ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black">{s.name || 'جلسة واتساب'}</div>
                    <Badge variant={s.status === 'connected' ? 'default' : s.status === 'qr' ? 'secondary' : 'outline'}>
                      {statusText(s.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{s.sessionId}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline">Delay {s.delayMin ?? 5}-{s.delayMax ?? 15}s</Badge>
                    <Badge variant="outline">حد {s.dailyLimit ?? 200}</Badge>
                    <Badge variant="outline">اليوم {s.sentToday ?? 0}</Badge>
                  </div>
                </button>
              ))}

              {!sessions.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد جلسات بعد</div>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                الربط
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeId && (
                <div className="rounded-2xl border bg-muted/20 p-3 font-mono text-xs" dir="ltr">
                  {activeId}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="9647XXXXXXXX" dir="ltr" />
                <Button variant="outline" onClick={pair} disabled={!activeId}>كود الربط</Button>
              </div>

              {pairCode && (
                <div className="rounded-2xl border bg-background p-5 text-center">
                  <div className="text-xs text-muted-foreground">كود الربط</div>
                  <div className="mt-2 text-3xl font-black tracking-[0.35em]" dir="ltr">{pairCode}</div>
                </div>
              )}

              <div className="flex min-h-[310px] items-center justify-center rounded-3xl border border-dashed p-5">
                {qrImage ? (
                  <div className="space-y-3 text-center">
                    <img src={qrImage} alt="WhatsApp QR" className="mx-auto h-72 w-72 rounded-2xl bg-white p-3" />
                    <p className="text-xs text-muted-foreground">امسح الباركود من واتساب</p>
                  </div>
                ) : active?.status === 'connected' ? (
                  <div className="space-y-3 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600">
                      <ShieldCheck className="h-8 w-8" />
                    </div>
                    <div className="font-black">الجلسة متصلة</div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <QrCode className="mx-auto mb-3 h-12 w-12 opacity-50" />
                    اختر جلسة أو أضف جلسة جديدة
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                إرسال تجربة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="9647XXXXXXXX" dir="ltr" />
              <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              <Button className="w-full" onClick={sendTest}>
                إرسال تجربة
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                إعدادات الستاندباي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="font-bold">تفعيل هذه الجلسة للإرسال</Label>
                    <div className="text-xs text-muted-foreground">إذا مطفأة، لا تدخل بالتوزيع.</div>
                  </div>
                  <Switch checked={activeSend} onCheckedChange={setActiveSend} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>أقل انتظار / ثانية</Label>
                  <Input className="mt-2" type="number" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} />
                </div>
                <div>
                  <Label>أعلى انتظار / ثانية</Label>
                  <Input className="mt-2" type="number" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>الحد اليومي للجلسة</Label>
                <Input className="mt-2" type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
              </div>

              <div className="rounded-2xl border bg-amber-50 p-3 text-xs text-amber-800">
                <TimerReset className="mb-2 h-4 w-4" />
                كل رسالة تنتظر رقم عشوائي بين الأقل والأعلى قبل الإرسال. مثل 10-25 ثانية.
              </div>

              <Button className="w-full" onClick={saveSettings} disabled={!activeId || saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الستاندباي'}
              </Button>

              <Button variant="destructive" className="w-full" onClick={logout} disabled={!activeId}>
                <Trash2 className="ml-2 h-4 w-4" />
                حذف نهائي من القائمة
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                إعدادات توزيع الرسائل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-4 text-xs leading-6 text-muted-foreground">
                يتجنب النظام الجلسات التي فشلها عالي، ويختار الأقل إرسالاً اليوم حتى يتوزع الحمل بشكل أذكى.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>أقصى فشل يومي</Label>
                  <Input className="mt-2" type="number" value={queueMaxFailedToday} onChange={(e) => setQueueMaxFailedToday(e.target.value)} />
                </div>

                <div>
                  <Label>أقصى نسبة فشل %</Label>
                  <Input className="mt-2" type="number" value={queueMaxFailRate} onChange={(e) => setQueueMaxFailRate(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>فترة مراقبة الفشل / ساعة</Label>
                <Input className="mt-2" type="number" value={queueWindowHours} onChange={(e) => setQueueWindowHours(e.target.value)} />
              </div>

              <div>
                <Label>طريقة اختيار الجلسة</Label>
                <select
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={queueMode}
                  onChange={(e) => setQueueMode(e.target.value)}
                >
                  <option value="balanced">متوازن</option>
                  <option value="least_sent">الأقل إرسالاً</option>
                  <option value="least_failed">الأقل فشلاً</option>
                </select>
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Label className="font-bold">تفعيل تمييز الرسائل</Label>
                    <div className="text-xs text-muted-foreground">يضيف مرجع مختلف لكل رسالة.</div>
                  </div>
                  <Switch checked={fingerprintEnabled} onCheckedChange={setFingerprintEnabled} />
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Label className="font-bold">تفعيل اختلاف المحتوى</Label>
                    <div className="text-xs text-muted-foreground">يستخدم الرموز والعشوائية داخل الرسالة.</div>
                  </div>
                  <Switch checked={uniqueMessageEnabled} onCheckedChange={setUniqueMessageEnabled} />
                </div>

                <Label>أسماء المراجع / مفصولة بفاصلة</Label>
                <Input className="mt-2" value={fingerprintLabels} onChange={(e) => setFingerprintLabels(e.target.value)} />

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label>أقل حروف</Label>
                    <Input className="mt-2" type="number" value={fingerprintMinLetters} onChange={(e) => setFingerprintMinLetters(e.target.value)} />
                  </div>
                  <div>
                    <Label>أكثر حروف</Label>
                    <Input className="mt-2" type="number" value={fingerprintMaxLetters} onChange={(e) => setFingerprintMaxLetters(e.target.value)} />
                  </div>
                  <div>
                    <Label>أقل رقم</Label>
                    <Input className="mt-2" type="number" value={fingerprintMinDigits} onChange={(e) => setFingerprintMinDigits(e.target.value)} />
                  </div>
                  <div>
                    <Label>أعلى رقم</Label>
                    <Input className="mt-2" type="number" value={fingerprintMaxDigits} onChange={(e) => setFingerprintMaxDigits(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label className="font-bold">استراحة إضافية</Label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label>كل كم رسالة</Label>
                    <Input className="mt-2" type="number" value={extraDelayEvery} onChange={(e) => setExtraDelayEvery(e.target.value)} />
                  </div>
                  <div>
                    <Label>مدة الاستراحة / ثانية</Label>
                    <Input className="mt-2" type="number" value={extraDelaySeconds} onChange={(e) => setExtraDelaySeconds(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Label className="font-bold">Warmup للجلسات الجديدة</Label>
                    <div className="text-xs text-muted-foreground">يقلل إرسال الجلسات الجديدة بالبداية.</div>
                  </div>
                  <Switch checked={warmupEnabled} onCheckedChange={setWarmupEnabled} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>مدة Warmup / ساعة</Label>
                    <Input className="mt-2" type="number" value={warmupHours} onChange={(e) => setWarmupHours(e.target.value)} />
                  </div>
                  <div>
                    <Label>حد يومي أثناء Warmup</Label>
                    <Input className="mt-2" type="number" value={warmupDailyLimit} onChange={(e) => setWarmupDailyLimit(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Label className="font-bold">Cooldown عند الفشل</Label>
                    <div className="text-xs text-muted-foreground">يبرد الجلسة مؤقتاً إذا فشل الإرسال.</div>
                  </div>
                  <Switch checked={cooldownEnabled} onCheckedChange={setCooldownEnabled} />
                </div>

                <Label>مدة التبريد / دقيقة</Label>
                <Input className="mt-2" type="number" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} />
              </div>

              <Button className="w-full" onClick={saveQueueSettings} disabled={savingQueue}>
                {savingQueue ? 'جاري الحفظ...' : 'حفظ إعدادات التوزيع'}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                آخر الرسائل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {logs.slice(0, 10).map((l) => (
                <div key={l.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr">{l.to}</span>
                    <Badge variant={l.status === 'sent' ? 'default' : l.status === 'failed' ? 'destructive' : 'secondary'}>
                      {l.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                    الجلسة: {l.sessionName || l.sessionId || '—'}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.message}</div>
                </div>
              ))}

              {!logs.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد رسائل بعد</div>}
            </CardContent>
          </Card>
        </div>

          </div>
        </TabsContent>

        <TabsContent value="telegram">
          <div className="rounded-[28px] border bg-gradient-to-l from-sky-500/15 via-background to-background p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white">
                  <SendHorizontal className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-black">تليكرام متعدد الجلسات</h1>
                  <p className="text-sm text-muted-foreground">
                    إرسال عبر حسابات Telegram شخصية باستخدام QR Login ورقم الهاتف.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">متصل {n(tgConnected)}</Badge>
                <Badge variant="outline">مرسل اليوم {n(tgSentToday)}</Badge>
                <Badge variant={tgFailedToday ? 'destructive' : 'outline'}>فشل {n(tgFailedToday)}</Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr_380px]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>جلسات تليكرام</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border bg-sky-50 p-3 text-xs leading-6 text-sky-900">
                  <div className="mb-1 font-black">تعليمات الربط</div>
                  <div>1- افتح my.telegram.org/apps</div>
                  <div>2- سجل دخول برقم تليكرام</div>
                  <div>3- اختر API Development Tools</div>
                  <div>4- انسخ API ID و API HASH واحفظها هنا</div>
                  <div>5- بعدها أنشئ جلسة وامسح QR من تطبيق Telegram</div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 font-black">
                    <KeyRound className="h-4 w-4" />
                    إعدادات Telegram API
                  </div>

                  <div className="grid gap-2">
                    <Label>API ID</Label>
                    <Input dir="ltr" value={tgApiId} onChange={(e) => setTgApiId(e.target.value)} placeholder="مثال: 123456" />
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Label>API HASH</Label>
                    <Input dir="ltr" value={tgApiHash} onChange={(e) => setTgApiHash(e.target.value)} placeholder={tgHasApiHash ? 'محفوظ سابقاً، اتركه أو غيّره' : 'ضع API HASH'} />
                  </div>

                  <Button className="mt-3 w-full" onClick={saveTelegramApi} disabled={tgSaving}>
                    {tgSaving ? 'جاري الحفظ...' : 'حفظ إعدادات API'}
                  </Button>
                </div>

                <Input
                  placeholder="اسم جلسة تليكرام الجديدة"
                  value={tgName}
                  onChange={(e) => setTgName(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={startTelegramNew} disabled={tgLoading || !tgHasApiHash}>
                    <Link2 className="ml-2 h-4 w-4" />
                    إضافة جلسة
                  </Button>
                  <Button variant="outline" onClick={reconnectTelegram} disabled={tgLoading || !tgActiveId || !tgHasApiHash}>
                    إعادة ربط
                  </Button>
                </div>

                <Button variant="outline" className="w-full" onClick={() => tgActiveId && refreshTelegramSession(tgActiveId)} disabled={!tgActiveId}>
                  <RefreshCw className="ml-2 h-4 w-4" />
                  تحديث الحالة
                </Button>

                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {tgSessions.map((s) => (
                    <button
                      key={s.sessionId}
                      type="button"
                      onClick={() => { setTgActiveId(s.sessionId); setTimeout(() => refreshTelegramSession(s.sessionId), 200); }}
                      className={`w-full rounded-2xl border p-3 text-start transition ${
                        tgActiveId === s.sessionId ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black">{s.name || 'جلسة تليكرام'}</div>
                        <Badge variant={s.status === 'connected' ? 'default' : s.status === 'qr' ? 'secondary' : 'outline'}>
                          {statusText(s.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{s.sessionId}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline">Delay {s.delayMin ?? 5}-{s.delayMax ?? 15}s</Badge>
                        <Badge variant="outline">حد {s.dailyLimit ?? 200}</Badge>
                        <Badge variant="outline">اليوم {s.sentToday ?? 0}</Badge>
                      </div>
                    </button>
                  ))}

                  {!tgSessions.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد جلسات تليكرام بعد</div>}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    ربط تليكرام
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tgActiveId && (
                    <div className="rounded-2xl border bg-muted/20 p-3 font-mono text-xs" dir="ltr">
                      {tgActiveId}
                    </div>
                  )}

                  <div className="flex min-h-[310px] items-center justify-center rounded-3xl border border-dashed p-5">
                    {tgQrImage ? (
                      <div className="space-y-3 text-center">
                        <img src={tgQrImage} alt="Telegram QR" className="mx-auto h-72 w-72 rounded-2xl bg-white p-3" />
                        <p className="text-xs text-muted-foreground">امسح QR من تطبيق Telegram</p>
                      </div>
                    ) : tgActive?.status === 'connected' ? (
                      <div className="space-y-3 text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/10 text-sky-600">
                          <ShieldCheck className="h-8 w-8" />
                        </div>
                        <div className="font-black">جلسة تليكرام متصلة</div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <QrCode className="mx-auto mb-3 h-12 w-12 opacity-50" />
                        احفظ API ثم أضف جلسة جديدة
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    إرسال تجربة تليكرام
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input value={tgTo} onChange={(e) => setTgTo(e.target.value)} placeholder="078XXXXXXXX أو 9647XXXXXXXX" dir="ltr" />
                  <Textarea rows={4} value={tgMessage} onChange={(e) => setTgMessage(e.target.value)} />
                  <Button className="w-full" onClick={sendTelegramTest}>
                    إرسال تجربة تليكرام
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    إعدادات جلسة تليكرام
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label className="font-bold">تفعيل هذه الجلسة للإرسال</Label>
                        <div className="text-xs text-muted-foreground">إذا مطفأة، لا تدخل بالتوزيع.</div>
                      </div>
                      <Switch checked={tgActiveSend} onCheckedChange={setTgActiveSend} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>أقل انتظار / ثانية</Label>
                      <Input className="mt-2" type="number" value={tgDelayMin} onChange={(e) => setTgDelayMin(e.target.value)} />
                    </div>
                    <div>
                      <Label>أعلى انتظار / ثانية</Label>
                      <Input className="mt-2" type="number" value={tgDelayMax} onChange={(e) => setTgDelayMax(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label>الحد اليومي للجلسة</Label>
                    <Input className="mt-2" type="number" value={tgDailyLimit} onChange={(e) => setTgDailyLimit(e.target.value)} />
                  </div>

                  <Button className="w-full" onClick={saveTelegramSessionSettings} disabled={!tgActiveId || tgSaving}>
                    {tgSaving ? 'جاري الحفظ...' : 'حفظ إعدادات تليكرام'}
                  </Button>

                  <Button variant="destructive" className="w-full" onClick={deleteTelegramSession} disabled={!tgActiveId}>
                    <Trash2 className="ml-2 h-4 w-4" />
                    حذف جلسة تليكرام
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    آخر رسائل تليكرام
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tgLogs.slice(0, 10).map((l) => (
                    <div key={l.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span dir="ltr">{l.to}</span>
                        <Badge variant={l.status === 'sent' ? 'default' : l.status === 'failed' ? 'destructive' : 'secondary'}>
                          {l.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                        الجلسة: {l.sessionName || l.sessionId || '—'}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.message}</div>
                      {l.error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{l.error}</div>}
                    </div>
                  ))}

                  {!tgLogs.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد رسائل تليكرام بعد</div>}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
}
