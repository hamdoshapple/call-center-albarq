import { useEffect, useState } from 'react';
import { MessageCircle, QrCode, RefreshCw, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const token = () => localStorage.getItem('cc_token') || '';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function WhatsappPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState('');
  const [qr, setQr] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('مرحباً {rand:عزيزي المشترك|أهلاً وسهلاً|تحية طيبة}، هذه رسالة تجربة من البرق الرقمي ✅');
  const [loading, setLoading] = useState(false);

  async function load() {
    const s = await api('/whatsapp/sessions');
    const l = await api('/whatsapp/logs');
    setSessions(s.sessions || []);
    setLogs(l.logs || []);
  }

  async function start(force = false) {
    setLoading(true);
    try {
      const data = await api('/whatsapp/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ name: name || undefined, sessionId: force ? activeId || undefined : undefined, force }),
      });
      setActiveId(data.session.sessionId);
      toast({ title: 'تم إنشاء/تشغيل جلسة واتساب' });
      await load();
    } catch (e: any) {
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function check(id = activeId) {
    if (!id) return;
    const st = await api(`/whatsapp/sessions/${id}/status`);
    if (st.hasQr || st.status === 'qr') {
      const q = await api(`/whatsapp/sessions/${id}/qr`);
      setQr(q.qrImage || '');
    } else {
      setQr('');
    }
    await load();
  }

  async function logout(id = activeId) {
    if (!id) return;
    await api('/whatsapp/sessions/logout', { method: 'POST', body: JSON.stringify({ sessionId: id }) });
    setQr('');
    await load();
  }

  async function sendTest() {
    if (!to || !message) return;
    setLoading(true);
    try {
      await api('/whatsapp/send', { method: 'POST', body: JSON.stringify({ to, message, sessionId: activeId || undefined }) });
      toast({ title: 'تم إرسال التجربة' });
      await load();
    } catch (e: any) {
      toast({ title: 'فشل الإرسال', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة واتساب" />

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" /> الجلسات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <Input placeholder="اسم الجلسة مثل: واتساب المحاسبة" value={name} onChange={(e) => setName(e.target.value)} />
              <Button disabled={loading} onClick={() => start(false)}>إضافة جلسة</Button>
              <Button variant="outline" disabled={!activeId || loading} onClick={() => start(true)}>إعادة ربط</Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => { setActiveId(s.sessionId); setTimeout(() => check(s.sessionId), 200); }}
                  className={`rounded-2xl border p-4 text-start ${activeId === s.sessionId ? 'border-primary bg-primary/10' : 'bg-background'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black">{s.name}</div>
                    <Badge variant={s.status === 'connected' ? 'default' : s.status === 'qr' ? 'secondary' : 'outline'}>{s.status}</Badge>
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{s.sessionId}</div>
                  <div className="mt-3 flex gap-2 text-xs">
                    <Badge variant="outline">اليوم {s.sentToday}</Badge>
                    <Badge variant={s.failedToday ? 'destructive' : 'outline'}>فشل {s.failedToday}</Badge>
                    <Badge variant="outline">حد {s.dailyLimit}</Badge>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => check()} disabled={!activeId}>
                <RefreshCw className="ml-2 h-4 w-4" /> تحديث الحالة
              </Button>
              <Button variant="destructive" onClick={() => logout()} disabled={!activeId}>
                <Trash2 className="ml-2 h-4 w-4" /> حذف الجلسة
              </Button>
            </div>

            <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-dashed p-5">
              {qr ? (
                <img src={qr} className="h-72 w-72 rounded-2xl bg-white p-3" />
              ) : sessions.find((x) => x.sessionId === activeId)?.status === 'connected' ? (
                <div className="text-center">
                  <ShieldCheck className="mx-auto h-14 w-14 text-green-600" />
                  <div className="mt-3 font-black">متصل</div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <QrCode className="mx-auto mb-3 h-12 w-12" />
                  اختار جلسة واضغط تحديث الحالة
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> إرسال تجربة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label>رقم المستلم</Label>
                <Input dir="ltr" placeholder="078xxxxxxx أو 9647xxxxxxx" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>الرسالة</Label>
                <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <Button className="w-full" disabled={loading} onClick={sendTest}>إرسال</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>آخر الرسائل</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {logs.slice(0, 10).map((l) => (
                <div key={l.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span dir="ltr">{l.to}</span>
                    <Badge variant={l.status === 'sent' ? 'default' : l.status === 'failed' ? 'destructive' : 'secondary'}>{l.status}</Badge>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.message}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
