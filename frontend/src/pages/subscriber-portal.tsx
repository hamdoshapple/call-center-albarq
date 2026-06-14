import { useEffect, useState } from 'react';
import { Phone, Wifi, Wallet, Calendar, MapPin, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const API = '/api/subscriber-portal';

function money(v: number) {
  return Number(v || 0).toLocaleString('en-US');
}

export function SubscriberPortalPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState(localStorage.getItem('subscriber_token') || '');
  const [step, setStep] = useState(token ? 'accounts' : 'phone');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const requestCode = async () => {
    setLoading(true);
    await fetch(`${API}/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    setLoading(false);
    setStep('code');
  };

  const login = async () => {
    setLoading(true);
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.token) {
      localStorage.setItem('subscriber_token', data.token);
      setToken(data.token);
      setStep('accounts');
    }
  };

  const loadAccounts = async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`${API}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    if (step === 'accounts') loadAccounts();
  }, [step, token]);

  const logout = () => {
    localStorage.removeItem('subscriber_token');
    setToken('');
    setAccounts([]);
    setStep('phone');
  };

  if (step !== 'accounts') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 p-4 text-white">
        <div className="mx-auto flex min-h-screen max-w-md items-center">
          <Card className="w-full border-white/10 bg-white/10 text-white backdrop-blur">
            <CardHeader>
              <CardTitle className="text-center text-2xl">بوابة المشترك</CardTitle>
              <p className="text-center text-sm text-white/60">شركة البرق الرقمي</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                dir="ltr"
                className="h-12 bg-white text-black"
                placeholder="078XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              {step === 'code' && (
                <Input
                  dir="ltr"
                  className="h-12 bg-white text-black"
                  placeholder="رمز التحقق 123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              )}

              {step === 'phone' ? (
                <Button className="h-12 w-full" disabled={loading || phone.length < 7} onClick={requestCode}>
                  إرسال رمز التحقق
                </Button>
              ) : (
                <Button className="h-12 w-full" disabled={loading || code.length < 4} onClick={login}>
                  دخول
                </Button>
              )}

              <p className="text-center text-xs text-white/50">للاختبار الرمز: 123456</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalDebt = accounts.reduce((s, a) => s + Number(a.debt || 0), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h1 className="text-2xl font-bold">حساباتي</h1>
              <p className="text-sm text-muted-foreground">كل الاشتراكات المرتبطة برقم هاتفك</p>
            </div>
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">عدد الحسابات</div><div className="text-2xl font-bold">{accounts.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">إجمالي الدين</div><div className="text-2xl font-bold text-red-600">{money(totalDebt)} د.ع</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">الحالة</div><div className="text-2xl font-bold">{accounts.some((a) => a.status === 'active') ? 'نشط' : 'متابعة'}</div></CardContent></Card>
        </div>

        {loading ? (
          <Card><CardContent className="p-6 text-center">جاري التحميل...</CardContent></Card>
        ) : accounts.length === 0 ? (
          <Card><CardContent className="p-6 text-center">لا توجد حسابات مرتبطة بهذا الرقم</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((a) => (
              <Card key={`${a.source}-${a.id}`} className="overflow-hidden">
                <CardHeader className="bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{a.name}</CardTitle>
                      <p className="font-mono text-sm text-muted-foreground">{a.pppoeUsername || '—'}</p>
                    </div>
                    <Badge>{a.source === 'cache' ? 'كاش' : 'محلي'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 text-sm">
                  <Info icon={Phone} label="الهاتف" value={a.phone} />
                  <Info icon={Wifi} label="الباقة" value={`${a.package || '—'} ${a.speed || ''}`} />
                  <Info icon={Wallet} label="الدين" value={`${money(a.debt)} د.ع`} danger={Number(a.debt || 0) > 0} />
                  <Info icon={Calendar} label="الانتهاء" value={a.expiration ? new Date(a.expiration).toLocaleDateString('ar-IQ') : '—'} />
                  <Info icon={MapPin} label="العنوان" value={a.address || '—'} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value, danger }: any) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className={danger ? 'font-bold text-red-600' : 'font-semibold'}>{value}</div>
    </div>
  );
}
