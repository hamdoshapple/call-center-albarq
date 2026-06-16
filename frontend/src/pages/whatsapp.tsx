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

  async function load() {
    const s = await api('/whatsapp/sessions');
    const list = s.sessions || [];
    setSessions(list);

    if (!activeId && list[0]?.sessionId) setActiveId(list[0].sessionId);

    const l = await api('/whatsapp/logs').catch(() => ({ logs: [] }));
    setLogs(l.logs || []);
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

  const connected = sessions.filter((x) => x.status === 'connected' && x.active !== false).length;
  const sentToday = sessions.reduce((sum, x) => sum + Number(x.sentToday || 0), 0);
  const failedToday = sessions.reduce((sum, x) => sum + Number(x.failedToday || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة واتساب" />

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
    </div>
  );
}
