import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  CreditCard,
  Headphones,
  Home,
  LogOut,
  MessageCircle,
  Phone,
  RefreshCw,
  User,
  Wallet,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const API = '/api/subscriber-portal';

type Account = {
  id: string;
  name: string;
  phone: string;
  pppoeUsername: string;
  status: string;
  package: string;
  speed: string;
  expiration: string | null;
  debt: number;
  address: string;
  notes: string;
  source: string;
};

function money(v: number) {
  return Number(v || 0).toLocaleString('en-US');
}

function daysLeft(date?: string | null) {
  if (!date) return null;
  const end = new Date(date).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / 86400000);
}

export function SubscriberPortalPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState(localStorage.getItem('subscriber_token') || '');
  const [step, setStep] = useState(token ? 'home' : 'phone');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'home' | 'accounts' | 'support' | 'profile'>('home');

  const active = accounts.find((a) => a.id === activeId) || accounts[0];
  const totalDebt = useMemo(() => accounts.reduce((s, a) => s + Number(a.debt || 0), 0), [accounts]);

  async function requestCode() {
    setLoading(true);
    await fetch(`${API}/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    setLoading(false);
    setStep('code');
  }

  async function login() {
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
      setStep('home');
    }
  }

  async function loadAccounts() {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`${API}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    setAccounts(rows);
    if (rows[0] && !activeId) setActiveId(rows[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (step === 'home') loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, token]);

  function logout() {
    localStorage.removeItem('subscriber_token');
    setToken('');
    setAccounts([]);
    setActiveId('');
    setStep('phone');
    setTab('home');
  }

  if (step !== 'home') {
    return (
      <div dir="rtl" className="min-h-screen overflow-hidden bg-white text-slate-950">
        <div className="pointer-events-none fixed inset-0 opacity-50">
          <div className="absolute -left-40 top-20 h-[520px] w-[520px] rounded-full border-[70px] border-slate-100" />
          <div className="absolute -left-20 top-80 h-[360px] w-[360px] rounded-full border-[55px] border-slate-100" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-7 py-10">
          <div className="mt-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[2rem] bg-gradient-to-br from-indigo-600 to-cyan-500 text-3xl font-black text-white shadow-lg shadow-indigo-200">
              ⚡
            </div>
            <p className="text-sm font-bold text-indigo-600">Albarq Digital</p>
          </div>

          <div className="mt-24 text-center">
            <h1 className="text-6xl font-black text-indigo-600">أهلاً وسهلاً</h1>
            <p className="mt-5 text-xl leading-9 text-slate-700">
              انضمامك لتطبيق <b className="text-indigo-600">البرق</b>
              <br />
              إدارة اشتراك الإنترنت صارت أسهل
            </p>
          </div>

          <div className="mt-auto pb-8">
            <h2 className="text-3xl font-black">
              إنت واشتراكك بأمان
            </h2>
            <p className="mt-2 text-slate-400">سجل رقم هاتفك للدخول إلى حساباتك</p>

            <div className="mt-6 flex gap-3">
              <div className="flex h-14 w-24 items-center justify-center rounded-2xl bg-slate-100 font-bold text-slate-500">
                +964
              </div>
              <Input
                dir="ltr"
                className="h-14 flex-1 rounded-2xl border-0 bg-slate-100 text-center text-lg font-bold"
                placeholder="77 XXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {step === 'code' && (
              <Input
                dir="ltr"
                className="mt-3 h-14 rounded-2xl border-0 bg-slate-100 text-center text-lg font-bold"
                placeholder="رمز التحقق 123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}

            {step === 'phone' ? (
              <Button className="mt-6 h-14 w-full rounded-2xl bg-indigo-600 text-lg font-bold" disabled={loading || phone.length < 7} onClick={requestCode}>
                التحقق من الرقم
              </Button>
            ) : (
              <Button className="mt-6 h-14 w-full rounded-2xl bg-indigo-600 text-lg font-bold" disabled={loading || code.length < 4} onClick={login}>
                تسجيل الدخول
              </Button>
            )}

            <p className="mt-6 text-center text-sm text-slate-400">
              رمز التحقق التجريبي: <span className="font-bold text-indigo-600">123456</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto max-w-md px-5 py-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">مرحباً</h1>
            <p className="text-sm text-slate-500">{active?.name || 'مشترك البرق'}</p>
          </div>
          <div className="flex gap-2">
            <IconButton icon={Bell} />
            <button onClick={logout} className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold shadow-sm">
              <LogOut className="h-4 w-4" />
              خروج
            </button>
          </div>
        </header>

        {tab === 'home' && (
          <main className="mt-6 space-y-5">
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-700 via-indigo-600 to-cyan-500 p-5 text-white shadow-lg shadow-indigo-200">
              <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-16 right-16 h-48 w-48 rounded-full bg-white/10" />
              <div className="flex items-center justify-between">
                <Badge className="rounded-full bg-cyan-500 text-white hover:bg-cyan-500">
                  فعال
                </Badge>
                <span className="text-xs text-indigo-100">آخر تحديث الآن</span>
              </div>

              <div className="mt-8">
                <p className="text-sm text-indigo-100">اشتراك الإنترنت</p>
                <h2 className="mt-1 text-4xl font-black">{active?.package || 'باقة الإنترنت'}</h2>
                <p className="mt-1 text-xl font-bold">{active?.speed || '—'}</p>
              </div>

              <div className="mt-7">
                <div className="mb-2 flex justify-between text-sm text-indigo-100">
                  <span>{daysLeft(active?.expiration) ?? '—'} يوم متبقي</span>
                  <span>{active?.expiration ? new Date(active.expiration).toLocaleDateString('ar-IQ') : '—'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/30">
                  <div className="h-full w-2/3 rounded-full bg-emerald-400" />
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <ActionCard title="تجديد الاشتراك" icon={RefreshCw} />
              <ActionCard title="تفاصيل الاشتراك" icon={Wifi} />
            </div>

            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">إجمالي الدين لكل الحسابات</p>
              <h3 className="mt-2 text-4xl font-black text-red-500">{money(totalDebt)} د.ع</h3>
              <p className="mt-2 text-sm text-slate-400">عدد الحسابات المرتبطة: {accounts.length}</p>
            </section>

            <section className="rounded-3xl bg-indigo-50 p-4 text-indigo-700">
              بعض معلوماتك غير مكتملة، افتح تذكرة لتحديث بياناتك.
            </section>
          </main>
        )}

        {tab === 'accounts' && (
          <main className="mt-6 space-y-3">
            <h2 className="text-2xl font-black">حساباتي</h2>
            {loading ? <p>جاري التحميل...</p> : accounts.map((a) => {
              const selected = activeId === a.id;
              return (
                <button
                  key={`${a.source}-${a.id}`}
                  onClick={() => setActiveId(a.id)}
                  className={`w-full rounded-[24px] bg-white p-5 text-start shadow-sm transition ${
                    selected ? 'ring-2 ring-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-black">{a.name}</h3>
                      <p className="font-mono text-sm text-slate-400">{a.pppoeUsername || '—'}</p>
                    </div>
                    <Badge className={selected ? 'bg-indigo-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-100'}>
                      {selected ? 'مختار' : a.source === 'cache' ? 'كاش' : 'محلي'}
                    </Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <Mini label="الباقة" value={a.package || '—'} />
                    <Mini label="الدين" value={money(a.debt)} danger />
                    <Mini label="الانتهاء" value={a.expiration ? new Date(a.expiration).toLocaleDateString('ar-IQ') : '—'} />
                  </div>
                </button>
              );
            })}
          </main>
        )}

        {tab === 'support' && (
          <main className="mt-6 space-y-5">
            <h2 className="text-3xl font-black">الدعم الفني</h2>

            <section className="rounded-[28px] bg-indigo-600 p-6 text-white">
              <h3 className="text-3xl font-black">تحتاج مساعدة؟</h3>
              <p className="mt-2 text-indigo-100">افتح تذكرة وسيتم متابعتها من فريق الدعم</p>
              <Button className="mt-6 rounded-2xl bg-white text-indigo-600 hover:bg-white">
                فتح تذكرة
              </Button>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <ActionCard title="محادثة سريعة" icon={MessageCircle} />
              <ActionCard title="اتصال سريع" icon={Headphones} />
            </div>

            <section className="space-y-3">
              <h3 className="text-xl font-black">الأسئلة الشائعة</h3>
              {['شلون أجدد الاشتراك؟', 'شلون أفتح تذكرة؟', 'شلون أعرف الدين؟', 'شلون أغير الباقة؟'].map((x) => (
                <div key={x} className="rounded-2xl bg-white p-4 font-bold text-slate-600 shadow-sm">
                  {x}
                </div>
              ))}
            </section>
          </main>
        )}

        {tab === 'profile' && (
          <main className="mt-6 space-y-4">
            <h2 className="text-3xl font-black">الحساب</h2>
            <Info icon={User} label="الاسم" value={active?.name || '—'} />
            <Info icon={Phone} label="الهاتف" value={active?.phone || '—'} />
            <Info icon={Wallet} label="إجمالي الدين" value={`${money(totalDebt)} د.ع`} />
            <Info icon={Calendar} label="تاريخ الانتهاء" value={active?.expiration ? new Date(active.expiration).toLocaleDateString('ar-IQ') : '—'} />
          </main>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t bg-white/95 px-5 py-3 backdrop-blur">
        <div className="grid grid-cols-4 gap-1">
          <NavItem active={tab === 'home'} icon={Home} label="الرئيسية" onClick={() => setTab('home')} />
          <NavItem active={tab === 'accounts'} icon={CreditCard} label="الحسابات" onClick={() => setTab('accounts')} />
          <NavItem active={tab === 'support'} icon={MessageCircle} label="الدعم" onClick={() => setTab('support')} />
          <NavItem active={tab === 'profile'} icon={User} label="حسابي" onClick={() => setTab('profile')} />
        </div>
      </nav>
    </div>
  );
}

function IconButton({ icon: Icon }: any) {
  return (
    <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ActionCard({ title, icon: Icon }: any) {
  return (
    <button className="flex h-24 items-center justify-between rounded-3xl bg-white p-5 text-start font-black shadow-sm">
      <span>{title}</span>
      <Icon className="h-6 w-6 text-indigo-600" />
    </button>
  );
}

function Mini({ label, value, danger }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 truncate font-black ${danger ? 'text-red-500' : ''}`}>{value}</div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </div>
      <b>{value}</b>
    </div>
  );
}

function NavItem({ active, icon: Icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-xs font-bold ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
      <Icon className="h-6 w-6" />
      {label}
    </button>
  );
}
