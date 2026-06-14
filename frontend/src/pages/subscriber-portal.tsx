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
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const API = '/api/subscriber-portal';

type SubscriberAppConfig = {
  appName?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  expiredColor?: string;
  warningColor?: string;
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
  welcomeMessage?: string | null;
  expiredMessage?: string | null;
  popupEnabled?: boolean;
  popupTitle?: string | null;
  popupMessage?: string | null;
  enablePayments?: boolean;
  enableTickets?: boolean;
  enableNotifications?: boolean;
};

type Banner = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
};

type PaymentRow = {
  id: number;
  date: string | null;
  amount: number;
  type: 'payment' | 'debt' | 'activation' | 'other';
  title: string;
  notes: string;
  package: string;
  dateFrom: string | null;
  dateTo: string | null;
  moneyIn: number;
  moneyOut: number;
};

type PaymentsData = {
  summary: {
    totalPaid: number;
    totalActivations: number;
    totalDebtRows: number;
    paymentsCount: number;
  };
  rows: PaymentRow[];
};

type PortalTicket = {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed' | string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  createdAt: string;
  updatedAt: string;
  notes?: Array<{
    id: string;
    body: string;
    createdAt: string;
    author?: { fullName?: string; username?: string } | null;
  }>;
};

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
  return Math.ceil((end - Date.now()) / 86400000);
}

function phoneLink(v?: string | null) {
  if (!v) return '';
  return String(v).replace(/[^\d+]/g, '');
}

function assetUrl(v?: string | null) {
  if (!v) return '';
  if (v.startsWith('http')) return v;
  if (v.startsWith('/uploads/')) return `/api${v}`;
  return v;
}

function waLink(v?: string | null, msg = '') {
  if (!v) return '';
  let n = String(v).replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '964' + n.slice(1);
  return `https://wa.me/${n}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
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
  const [config, setConfig] = useState<SubscriberAppConfig>({});
  const [banners, setBanners] = useState<Banner[]>([]);
  const [expiredPopupClosed, setExpiredPopupClosed] = useState(false);
  const [payments, setPayments] = useState<PaymentsData | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsAccountId, setPaymentsAccountId] = useState('');

  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('انقطاع خدمة');
  const [ticketBody, setTicketBody] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [ticketsAccountId, setTicketsAccountId] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  const primary = config.primaryColor || '#4f46e5';
  const secondary = config.secondaryColor || '#06b6d4';
  const expiredColor = config.expiredColor || '#dc2626';
  const warningColor = config.warningColor || '#f59e0b';

  const active = accounts.find((a) => a.id === activeId) || accounts[0];
  const totalDebt = useMemo(() => accounts.reduce((s, a) => s + Number(a.debt || 0), 0), [accounts]);
  const latestTicket = ticketsAccountId === active?.id ? tickets[0] : undefined;
  const left = daysLeft(active?.expiration);
  const isExpired = left !== null && left < 0;
  const isWarning = left !== null && left >= 0 && left <= 5;

  const cardColor = isExpired ? expiredColor : isWarning ? warningColor : primary;
  const statusText = isExpired ? 'منتهي' : isWarning ? 'ينتهي قريباً' : 'فعال';

  async function loadAppConfig() {
    try {
      const res = await fetch(`${API}/app-config`);
      const data = await res.json();
      setConfig(data.config || {});
      setBanners(Array.isArray(data.banners) ? data.banners : []);
    } catch {}
  }

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
    if (rows[0] && !activeId) {
      const savedId = localStorage.getItem('subscriber_active_account') || '';
      const chosen = rows.find((x: Account) => x.id === savedId) || rows[0];

      setActiveId(chosen.id);
      localStorage.setItem('subscriber_active_account', chosen.id);
      loadPayments(chosen.id);
      loadTickets(chosen.id);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAppConfig();
  }, []);

  useEffect(() => {
    if (step === 'home') loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, token]);

  useEffect(() => {
    if (step === 'home' && activeId) {
      loadPayments(activeId);
      loadTickets(activeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, token, activeId]);

  async function loadPayments(accountId?: string) {
    const id = accountId || active?.id;
    if (!token || !id) return;

    setPayments(null);
    setPaymentsAccountId(id);

    try {
      setPaymentsLoading(true);
      const res = await fetch(`${API}/accounts/${encodeURIComponent(id)}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      setPayments((prev) => {
        void prev;
        return data;
      });
    } catch {
      setPayments(null);
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function loadTickets(accountId?: string) {
    const id = accountId || active?.id;
    if (!token || !id) return;

    setTickets([]);
    setTicketsAccountId(id);

    try {
      setTicketsLoading(true);
      const res = await fetch(`${API}/accounts/${encodeURIComponent(id)}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }

  async function createTicket() {
    const id = active?.id;
    if (!token || !id || !ticketSubject.trim()) return;

    setTicketsLoading(true);
    try {
      const res = await fetch(`${API}/accounts/${encodeURIComponent(id)}/tickets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: ticketSubject,
          body: ticketBody,
          priority: ticketSubject.includes('انقطاع') ? 'high' : 'medium',
        }),
      });

      const data = await res.json();
      if (data?.id) {
        setTicketBody('');
        setSelectedTicketId(data.id);
        await loadTickets(id);
      }
    } finally {
      setTicketsLoading(false);
    }
  }

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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-[2rem] bg-white shadow-lg">
              {config.logoUrl ? (
                <img
                  src={assetUrl(config.logoUrl)}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-3xl font-black">⚡</span>
              )}
            </div>
            <p className="text-sm font-bold" style={{ color: primary }}>
              {config.appName || 'Albarq Digital'}
            </p>
          </div>

          <div className="mt-24 text-center">
            <h1 className="glitch-text text-5xl font-black" style={{ color: primary }}>
              {config.welcomeMessage || 'أهلاً وسهلاً'}
            </h1>
            <p className="mt-5 text-xl leading-9 text-slate-700">
              انضمامك لتطبيق <b style={{ color: primary }}>{config.appName || 'البرق'}</b>
              <br />
              إدارة اشتراك الإنترنت صارت أسهل
            </p>
          </div>

          <div className="mt-auto pb-8">
            <h2 className="text-3xl font-black">إنت واشتراكك بأمان</h2>
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
              <Button
                className="mt-6 h-14 w-full rounded-2xl text-lg font-bold text-white"
                style={{ backgroundColor: primary }}
                disabled={loading || phone.length < 7}
                onClick={requestCode}
              >
                التحقق من الرقم
              </Button>
            ) : (
              <Button
                className="mt-6 h-14 w-full rounded-2xl text-lg font-bold text-white"
                style={{ backgroundColor: primary }}
                disabled={loading || code.length < 4}
                onClick={login}
              >
                تسجيل الدخول
              </Button>
            )}

            <p className="mt-6 text-center text-sm text-slate-400">
              رمز التحقق التجريبي: <span className="font-bold" style={{ color: primary }}>123456</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 pb-40 pt-[116px] text-slate-950">
      {isExpired && config.popupEnabled && !expiredPopupClosed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black" style={{ color: expiredColor }}>
                  {config.popupTitle || 'الاشتراك منتهي'}
                </h3>
                <p className="mt-2 text-slate-500">
                  {config.popupMessage || config.expiredMessage || 'يرجى التواصل مع الدعم لتجديد الاشتراك.'}
                </p>
              </div>
              <button onClick={() => setExpiredPopupClosed(true)} className="rounded-full bg-slate-100 p-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {config.supportWhatsapp && (
                <a
                  href={waLink(config.supportWhatsapp, 'مرحبا، اشتراكي منتهي وأريد التجديد')}
                  className="rounded-2xl px-4 py-3 text-center font-bold text-white"
                  style={{ backgroundColor: primary }}
                >
                  واتساب
                </a>
              )}
              {config.supportPhone && (
                <a
                  href={`tel:${phoneLink(config.supportPhone)}`}
                  className="rounded-2xl bg-slate-100 px-4 py-3 text-center font-bold"
                >
                  اتصال
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md px-5">
        <header className="fixed inset-x-0 top-0 z-50 mx-auto flex max-w-md items-center justify-between bg-slate-100/95 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur">
          <div className="flex items-center gap-3">
            {config.logoUrl && (
              <img
                src={assetUrl(config.logoUrl)}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="h-12 w-12 rounded-2xl bg-white object-contain p-1 shadow-sm"
              />
            )}
            <div>
              <h1 className="glitch-text text-3xl font-black">مرحباً</h1>
              <button
                onClick={() => setAccountPickerOpen(true)}
                className="mt-1 flex max-w-[185px] items-center gap-1 text-start text-sm font-bold text-slate-500"
              >
                <span className="block min-w-0 truncate">
                  {active?.name || config.appName || 'مشترك البرق'}
                </span>
                <span className="shrink-0" style={{ color: primary }}>⌄</span>
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {config.enableNotifications !== false && <IconButton icon={Bell} />}
            <button onClick={logout} className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold shadow-sm">
              <LogOut className="h-4 w-4" />
              خروج
            </button>
          </div>
        </header>

        {tab === 'home' && (
          <main className="mt-6 space-y-5">
            <section className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${cardColor}, ${secondary})` }}>
              <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-16 right-16 h-48 w-48 rounded-full bg-white/10" />

              <div className="flex items-center justify-between">
                <Badge className="rounded-full bg-white/20 text-white hover:bg-white/20">
                  {statusText}
                </Badge>
                <span className="text-xs text-white/80">آخر تحديث الآن</span>
              </div>

              <div className="mt-8">
                <p className="text-sm text-white/80">اشتراك الإنترنت</p>
                <h2 className="mt-1 text-4xl font-black">{active?.package || 'باقة الإنترنت'}</h2>
                <p className="mt-1 text-xl font-bold">{active?.speed || '—'}</p>
              </div>

              <div className="mt-7">
                <div className="mb-2 flex justify-between text-sm text-white/80">
                  <span>
                    {left === null ? '—' : isExpired ? `منتهي منذ ${Math.abs(left)} يوم` : `${left} يوم متبقي`}
                  </span>
                  <span>{active?.expiration ? new Date(active.expiration).toLocaleDateString('ar-IQ') : '—'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/30">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: isExpired ? '100%' : '70%' }} />
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <ActionCard title="تفاصيل الاشتراك" icon={Wifi} color={primary} onClick={() => setTab('accounts')} />

              <button
                onClick={() => setTab('accounts')}
                className="flex h-20 flex-col items-start justify-center rounded-3xl bg-white p-4 text-start shadow-sm"
              >
                <span className="text-sm text-slate-500">إجمالي الدين</span>
                <span className="mt-1 text-3xl font-black" style={{ color: totalDebt > 0 ? expiredColor : primary }}>
                  {money(totalDebt)} د.ع
                </span>
              </button>

              {config.enablePayments && (
                <ActionCard title="تجديد الاشتراك" icon={RefreshCw} color={primary} />
              )}
            </div>

            {banners.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-2xl font-black">العروض والإعلانات</h2>

                {banners.slice(0, 1).map((b) => (
                  <a
                    key={b.id}
                    href={b.linkUrl || '#'}
                    className="relative block h-44 overflow-hidden rounded-[28px] bg-slate-900 shadow-sm"
                  >
                    {b.imageUrl && (
                      <img
                        src={assetUrl(b.imageUrl)}
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/35 to-black/10" />

                    <div className="relative z-10 flex h-full flex-col justify-end p-5 text-white">
                      <h3 className="text-2xl font-black">{b.title}</h3>
                      {b.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-white/85">
                          {b.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-sm font-bold">
                        عرض التفاصيل
                        <span>←</span>
                      </div>
                    </div>
                  </a>
                ))}

                {banners.length > 1 && (
                  <div>
                    <h3 className="mb-3 mt-5 text-xl font-black">اكتشف المزيد</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {banners.slice(1).map((b) => (
                        <a
                          key={b.id}
                          href={b.linkUrl || '#'}
                          className="relative h-40 w-28 shrink-0 overflow-hidden rounded-[22px] bg-slate-900 shadow-sm"
                        >
                          {b.imageUrl && (
                            <img
                              src={assetUrl(b.imageUrl)}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                          <div className="absolute bottom-3 right-3 left-3 text-white">
                            <div className="line-clamp-2 text-sm font-black">{b.title}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <PaymentsPanel
              payments={paymentsAccountId === active?.id ? payments : null}
              loading={paymentsLoading}
              account={active}
              primary={primary}
              expiredColor={expiredColor}
            />

            {config.enableTickets !== false && (
              latestTicket ? (
                <button
                  onClick={() => { setSelectedTicketId(latestTicket.id); setTab('support'); }}
                  className="w-full rounded-3xl bg-white p-4 text-start shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-500">آخر تذكرة</div>
                      <div className="mt-1 line-clamp-1 text-lg font-black">{latestTicket.subject}</div>
                      <div className="mt-1 text-xs text-slate-400">{new Date(latestTicket.createdAt).toLocaleDateString('ar-IQ')}</div>
                    </div>
                    <TicketBadge status={latestTicket.status} primary={primary} />
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => setTab('support')}
                  className="w-full rounded-3xl p-4 text-start"
                  style={{ backgroundColor: `${primary}14`, color: primary }}
                >
                  بعض معلوماتك غير مكتملة، افتح تذكرة لتحديث بياناتك.
                </button>
              )
            )}
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
                  onClick={() => {
                    setActiveId(a.id);
                    localStorage.setItem('subscriber_active_account', a.id);
                    setSelectedTicketId('');
                    loadPayments(a.id);
                    loadTickets(a.id);
                  }}
                  className="w-full rounded-[24px] bg-white p-5 text-start shadow-sm transition"
                  style={{ boxShadow: selected ? `0 0 0 2px ${primary}` : undefined }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-black">{a.name}</h3>
                      <p className="font-mono text-sm text-slate-400">{a.pppoeUsername || '—'}</p>
                    </div>
                    <Badge style={{ backgroundColor: selected ? primary : '#f1f5f9', color: selected ? 'white' : '#64748b' }}>
                      {selected ? 'مختار' : a.source === 'live' ? 'مباشر' : a.source === 'cache' ? 'كاش' : 'محلي'}
                    </Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                    <Mini label="الباقة" value={a.package || '—'} />
                    <Mini label="السرعة" value={a.speed || '—'} />
                    <Mini label="الدين" value={`${money(a.debt)} د.ع`} danger />
                    <Mini label="الانتهاء" value={a.expiration ? new Date(a.expiration).toLocaleDateString('ar-IQ') : '—'} />
                    <Mini label="الهاتف" value={a.phone || '—'} />
                    <Mini label="العنوان" value={a.address || '—'} />
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                    <div className="font-bold text-slate-700">آخر الحركات</div>
                    {selected && paymentsAccountId === a.id && payments?.rows?.length ? (
                      <div className="mt-2 space-y-2">
                        {payments.rows.slice(0, 5).map((x) => (
                          <PaymentItem key={x.id} row={x} primary={primary} expiredColor={expiredColor} compact />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1">لا توجد حركات لهذا الحساب.</div>
                    )}
                  </div>
                </button>
              );
            })}
          </main>
        )}

        {tab === 'support' && (
          <main className="mt-6 space-y-5">
            <h2 className="text-3xl font-black">الدعم الفني</h2>

            <section className="rounded-[28px] p-6 text-white" style={{ backgroundColor: primary }}>
              <h3 className="text-3xl font-black">تحتاج مساعدة؟</h3>
              <p className="mt-2 text-white/80">افتح تذكرة وسيتم متابعتها من فريق الدعم</p>
            </section>

            {config.enableTickets !== false && (
              <section className="rounded-[28px] bg-white p-5 shadow-sm">
                <h3 className="text-xl font-black">فتح تذكرة جديدة</h3>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {['انقطاع خدمة', 'بطء الإنترنت', 'مشكلة فاتورة', 'أخرى'].map((x) => (
                    <button
                      key={x}
                      onClick={() => setTicketSubject(x)}
                      className="rounded-2xl px-3 py-3 text-sm font-bold"
                      style={{
                        backgroundColor: ticketSubject === x ? primary : '#f1f5f9',
                        color: ticketSubject === x ? 'white' : '#334155',
                      }}
                    >
                      {x}
                    </button>
                  ))}
                </div>

                <textarea
                  className="mt-3 min-h-28 w-full rounded-2xl border-0 bg-slate-100 p-4 text-sm outline-none"
                  placeholder="اكتب تفاصيل المشكلة..."
                  value={ticketBody}
                  onChange={(e) => setTicketBody(e.target.value)}
                />

                <Button
                  disabled={ticketsLoading || !ticketSubject.trim()}
                  onClick={createTicket}
                  className="mt-3 h-12 w-full rounded-2xl text-white"
                  style={{ backgroundColor: primary }}
                >
                  {ticketsLoading ? 'جاري الإرسال...' : 'إرسال التذكرة'}
                </Button>
              </section>
            )}

            <div className="grid grid-cols-2 gap-3">
              {config.supportWhatsapp && (
                <a href={waLink(config.supportWhatsapp, 'مرحبا، أحتاج دعم فني')} className="rounded-3xl bg-white p-5 text-center font-black shadow-sm">
                  <MessageCircle className="mx-auto mb-2 h-7 w-7" style={{ color: primary }} />
                  واتساب
                </a>
              )}
              {config.supportPhone && (
                <a href={`tel:${phoneLink(config.supportPhone)}`} className="rounded-3xl bg-white p-5 text-center font-black shadow-sm">
                  <Headphones className="mx-auto mb-2 h-7 w-7" style={{ color: primary }} />
                  اتصال
                </a>
              )}
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black">تذاكري</h3>
                <button onClick={() => loadTickets(active?.id)} className="text-sm font-bold" style={{ color: primary }}>
                  تحديث
                </button>
              </div>

              {ticketsLoading && !tickets.length ? (
                <div className="rounded-3xl bg-white p-5 text-slate-500 shadow-sm">جاري تحميل التذاكر...</div>
              ) : tickets.length ? (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(selectedTicketId === t.id ? '' : t.id)}
                    className="w-full rounded-3xl bg-white p-5 text-start shadow-sm"
                    style={{ boxShadow: selectedTicketId === t.id ? `0 0 0 2px ${primary}` : undefined }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black">{t.subject}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {new Date(t.createdAt).toLocaleString('ar-IQ')}
                        </div>
                      </div>
                      <TicketBadge status={t.status} primary={primary} />
                    </div>

                    {selectedTicketId === t.id && (
                      <div className="mt-4 space-y-2 border-t pt-4">
                        {(t.notes || []).map((n: any) => (
                          <div key={n.id} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                            <div className="mb-1 text-xs font-bold text-slate-400">
                              {n.author?.fullName || 'المشترك'} • {new Date(n.createdAt).toLocaleString('ar-IQ')}
                            </div>
                            <pre className="whitespace-pre-wrap font-sans leading-6">{n.body}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <div className="rounded-3xl bg-white p-5 text-slate-500 shadow-sm">لا توجد تذاكر حالياً.</div>
              )}
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

      {accountPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4" onClick={() => setAccountPickerOpen(false)}>
          <div className="w-full max-w-md rounded-t-[32px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl font-black">اختر الحساب</h3>
              <button onClick={() => setAccountPickerOpen(false)} className="rounded-full bg-slate-100 px-3 py-1 font-bold">إغلاق</button>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pb-2">
              {accounts.map((a) => {
                const selected = activeId === a.id;
                return (
                  <button
                    key={`${a.source}-${a.id}-picker`}
                    onClick={() => {
                      setActiveId(a.id);
                      localStorage.setItem('subscriber_active_account', a.id);
                      setSelectedTicketId('');
                      setAccountPickerOpen(false);
                      loadPayments(a.id);
                      loadTickets(a.id);
                    }}
                    className="relative w-full overflow-hidden rounded-3xl p-4 text-start"
                    style={{
                      backgroundColor: selected ? `${primary}10` : '#f8fafc',
                      boxShadow: selected ? '0 10px 25px rgba(15,23,42,0.08)' : undefined,
                    }}
                  >
                    {selected && (
                      <span
                        className="absolute bottom-4 right-0 top-4 w-1 rounded-full"
                        style={{ backgroundColor: primary }}
                      />
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 pr-3">
                        <div className="line-clamp-1 font-black">{a.name}</div>
                        <div className="mt-1 font-mono text-xs text-slate-400">{a.pppoeUsername || '—'}</div>
                      </div>
                      <span className="shrink-0 rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: selected ? primary : '#e2e8f0', color: selected ? 'white' : '#64748b' }}>
                        {selected ? 'مختار' : 'اختيار'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t bg-white/95 px-5 py-3 backdrop-blur">
        <div className="grid grid-cols-4 gap-1">
          <NavItem active={tab === 'home'} icon={Home} label="الرئيسية" color={primary} onClick={() => setTab('home')} />
          <NavItem active={tab === 'accounts'} icon={CreditCard} label="الحسابات" color={primary} onClick={() => setTab('accounts')} />
          <NavItem active={tab === 'support'} icon={MessageCircle} label="الدعم" color={primary} onClick={() => setTab('support')} />
          <NavItem active={tab === 'profile'} icon={User} label="حسابي" color={primary} onClick={() => setTab('profile')} />
        </div>
      </nav>
    </div>
  );
}


function formatDate(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('ar-IQ');
}

function paymentTone(type: PaymentRow['type'], primary: string, expiredColor: string) {
  if (type === 'payment') return '#16a34a';
  if (type === 'activation') return primary;
  if (type === 'debt') return expiredColor;
  return '#64748b';
}

function PaymentsPanel({
  payments,
  loading,
  account,
  primary,
  expiredColor,
}: {
  payments: PaymentsData | null;
  loading: boolean;
  account?: Account;
  primary: string;
  expiredColor: string;
}) {
  const rows = payments?.rows || [];
  const paidRows = rows.filter((x) => x.type === 'payment');

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">آخر المدفوعات</h2>
          {account?.name && (
            <p className="mt-1 line-clamp-1 text-sm text-slate-500">{account.name}</p>
          )}
        </div>
        <Wallet className="h-6 w-6" style={{ color: primary }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[22px] bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">إجمالي المدفوع</div>
          <div className="mt-1 text-2xl font-black text-green-600">
            {money(payments?.summary?.totalPaid || 0)}
          </div>
        </div>
        <div className="rounded-[22px] bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">عدد الدفعات</div>
          <div className="mt-1 text-2xl font-black" style={{ color: primary }}>
            {payments?.summary?.paymentsCount || 0}
          </div>
        </div>
      </div>

      <div className="rounded-[26px] bg-white p-4 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">جاري تحميل المدفوعات...</div>
        ) : paidRows.length ? (
          <div className="space-y-3">
            {paidRows.slice(0, 4).map((x) => (
              <PaymentItem key={x.id} row={x} primary={primary} expiredColor={expiredColor} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">لا توجد دفعات لهذا الحساب.</div>
        )}
      </div>
    </section>
  );
}

function PaymentItem({
  row,
  primary,
  expiredColor,
  compact,
}: {
  row: PaymentRow;
  primary: string;
  expiredColor: string;
  compact?: boolean;
}) {
  const color = paymentTone(row.type, primary, expiredColor);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="truncate font-black">{row.title}</div>
        </div>

        <div className="mt-1 text-xs text-slate-500">
          {formatDate(row.date)}
          {row.package ? ` • ${row.package}` : ''}
        </div>

        {!compact && row.notes && (
          <div className="mt-1 line-clamp-1 text-xs text-slate-400">
            {row.notes}
          </div>
        )}
      </div>

      <div className="shrink-0 text-left">
        <div className="font-black" style={{ color }}>
          {money(row.amount)} د.ع
        </div>
        {row.dateFrom && row.dateTo && (
          <div className="text-[10px] text-slate-400">
            {formatDate(row.dateFrom)} - {formatDate(row.dateTo)}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketBadge({ status, primary }: { status: string; primary: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    open: { label: 'مفتوحة', color: primary, bg: `${primary}18` },
    pending: { label: 'قيد المتابعة', color: '#d97706', bg: '#fef3c7' },
    resolved: { label: 'تم الحل', color: '#16a34a', bg: '#dcfce7' },
    closed: { label: 'مغلقة', color: '#64748b', bg: '#f1f5f9' },
  };

  const x = map[status] || { label: status, color: '#64748b', bg: '#f1f5f9' };

  return (
    <span className="shrink-0 rounded-full px-3 py-1 text-xs font-black" style={{ color: x.color, backgroundColor: x.bg }}>
      {x.label}
    </span>
  );
}

function IconButton({ icon: Icon }: any) {
  return (
    <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ActionCard({ title, icon: Icon, color = '#4f46e5', onClick }: any) {
  return (
    <button onClick={onClick} className="flex h-20 items-center justify-between rounded-3xl bg-white p-4 text-start font-black shadow-sm">
      <span>{title}</span>
      <Icon className="h-6 w-6" style={{ color }} />
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

function NavItem({ active, icon: Icon, label, onClick, color = '#4f46e5' }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-xs font-bold" style={{ color: active ? color : '#94a3b8' }}>
      <Icon className="h-6 w-6" />
      {label}
    </button>
  );
}
