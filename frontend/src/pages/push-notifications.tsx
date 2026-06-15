import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BellRing,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Megaphone,
  RefreshCw,
  Search,
  Send,
  Settings,
  Smartphone,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { pushNotificationsApi } from '@/api/pushNotifications';

const targetLabels: Record<string, string> = {
  all: 'إرسال عام',
  phone: 'مشتركين محددين',
  debt: 'ديون',
  expire_days: 'قرب الانتهاء',
  expired: 'منتهين',
};

const typeLabels: Record<string, string> = {
  payment: 'تسديد',
  debt: 'دين',
  activation: 'تفعيل',
  expiry: 'قرب انتهاء',
  expired: 'منتهي',
  ticket: 'تكتات',
  manual: 'يدوي',
};

const defaultSettings = {
  auto: {
    enabled: true,
    onActivation: true,
    onRenewal: true,
    onPayment: true,
    onDebt: true,
    onTicketCreated: true,
    onTicketReply: true,
    onTicketStatus: true,
    onTicketClosed: true,
  },
  expiry: { beforeDays: [7, 3, 1], afterDays: [1, 3] },
  debt: { enabled: true, minAmount: 1000, repeatDays: 7 },
  channels: {
    activation: 'push',
    renewal: 'push',
    payment: 'push',
    debt: 'push',
    expiryBefore: 'push',
    expired: 'push',
    ticketCreated: 'push',
    ticketReply: 'push',
    ticketStatus: 'push',
    ticketClosed: 'push',
  },
  templates: {
    activation: 'تم تفعيل اشتراكك بنجاح.',
    renewal: 'تم تجديد اشتراكك بنجاح.',
    payment: 'تم تسجيل دفعة جديدة بقيمة {amount} د.ع.',
    debt: 'يوجد عليك مبلغ مستحق قدره {amount} د.ع.',
    expireBefore: 'اشتراك {name} سينتهي بعد {days} يوم. تاريخ الانتهاء: {date}',
    expired: 'اشتراك {name} منتهي منذ {days} يوم. تاريخ الانتهاء: {date}',
    ticketCreated: 'تم إنشاء تذكرتك وسيتم متابعتها من الفريق.',
    ticketReply: 'يوجد رد جديد على تذكرتك.',
    ticketStatus: 'تم تحديث حالة التذكرة إلى: {status}.',
    general: 'لديك إشعار جديد من البرق الرقمي.',
  },
};

function parseNums(v: string) {
  return v.split(/[,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0);
}

function money(v: any) {
  return Number(v || 0).toLocaleString('en-US');
}

function niceType(v: string) {
  const x = String(v || '');
  if (x.includes('payment')) return 'تسديد';
  if (x.includes('debt')) return 'دين';
  if (x.includes('activation')) return 'تفعيل';
  if (x.includes('expired')) return 'منتهي';
  if (x.includes('expiry')) return 'قرب انتهاء';
  if (x.includes('ticket')) return 'تكت';
  if (x.includes('manual')) return 'يدوي';
  return x || 'عام';
}

function channelLabel(v: any) {
  const x = String(v || 'push');
  if (x === 'off') return 'مطفأ';
  if (x === 'whatsapp') return 'واتساب فقط';
  if (x === 'both') return 'تطبيق + واتساب';
  return 'تطبيق فقط';
}

function ChannelSelect({ value, onChange }: any) {
  return (
    <Select value={String(value || 'push')} onValueChange={onChange}>
      <SelectTrigger className="h-10 rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="push">تطبيق فقط</SelectItem>
        <SelectItem value="whatsapp">واتساب فقط</SelectItem>
        <SelectItem value="both">تطبيق + واتساب</SelectItem>
        <SelectItem value="off">مطفأ</SelectItem>
      </SelectContent>
    </Select>
  );
}

function StatCard({ title, value, icon: Icon, tone = 'primary' }: any) {
  const toneClass =
    tone === 'green' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
    tone === 'red' ? 'bg-red-50 text-red-600 border-red-100' :
    tone === 'amber' ? 'bg-amber-50 text-amber-600 border-amber-100' :
    'bg-primary/10 text-primary border-primary/10';

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-2 text-3xl font-black tracking-tight">{value}</div>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClass}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}


export default function PushNotificationsPage() {
  const debtTone = (v: any) => {
    const n = Number(v || 0);
    if (n <= 0) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (n < 50000) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-red-200 bg-red-50 text-red-700';
  };

  const daysUntil = (v: any) => {
    if (!v) return null;
    return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  };

  const isExpiredSub = (sub: any) =>
    (sub.accounts || []).some((a: any) => {
      const d = daysUntil(a.expiration);
      return d !== null && d < 0;
    });

  const isNearExpirySub = (sub: any) =>
    (sub.accounts || []).some((a: any) => {
      const d = daysUntil(a.expiration);
      return d !== null && d >= 0 && d <= 7;
    });

  const isWantedSub = (sub: any) => Number(sub.totalDebt || 0) > 0;

  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: 'إشعار من البرق',
    message: '',
    targetType: 'all',
    targetValue: '',
    url: '/my',
    channel: 'push',
  });

  const [settings, setSettings] = useState<any>(defaultSettings);
  const [logFilters, setLogFilters] = useState({ q: '', status: 'all', type: 'all' });
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [subscriberFilter, setSubscriberFilter] = useState('all');

  const stats = useQuery({ queryKey: ['pushStats'], queryFn: pushNotificationsApi.stats });
  const pushLogs = useQuery({
    queryKey: ['pushLogs', logFilters],
    queryFn: () => pushNotificationsApi.logs(logFilters),
    refetchInterval: 15000,
  });
  const settingsQuery = useQuery({ queryKey: ['pushSettings'], queryFn: pushNotificationsApi.settings });
  const pushSubscribers = useQuery({
    queryKey: ['pushSubscribers', subscriberSearch, form.channel],
    queryFn: () => pushNotificationsApi.subscribers(subscriberSearch, form.channel),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);

  const summary = pushLogs.data?.summary || {};
  const rows = pushLogs.data?.rows || [];
  const financialTotal = Number(summary.payments || 0) + Number(summary.debts || 0) + Number(summary.activations || 0);

  const recentRows = useMemo(() => rows.slice(0, 5), [rows]);

  const sendMutation = useMutation({
    mutationFn: () => pushNotificationsApi.send(form.targetType === 'phone' ? { ...form, targetValue: selectedPhones.join(',') } : form),
    onSuccess: (data) => {
      toast({ title: 'تم الإرسال', description: `القناة: ${data.channel || 'push'} — وصل: ${data.sent} / فشل: ${data.failed}` });
      setForm((f) => ({ ...f, message: '' }));
      qc.invalidateQueries({ queryKey: ['pushStats'] });
      qc.invalidateQueries({ queryKey: ['pushLogs'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => pushNotificationsApi.saveSettings(settings),
    onSuccess: () => {
      toast({ title: 'تم حفظ إعدادات الإشعارات' });
      qc.invalidateQueries({ queryKey: ['pushSettings'] });
    },
  });

  const autoMutation = useMutation({
    mutationFn: pushNotificationsApi.runAuto,
    onSuccess: (data) => {
      toast({ title: 'تم تشغيل الفحص التلقائي', description: JSON.stringify(data.results || data.result || []) });
      qc.invalidateQueries({ queryKey: ['pushStats'] });
      qc.invalidateQueries({ queryKey: ['pushLogs'] });
    },
  });

  const setAuto = (k: string, v: boolean) => setSettings((s: any) => ({ ...s, auto: { ...s.auto, [k]: v } }));
  const setChannel = (k: string, v: string) => setSettings((s: any) => ({ ...s, channels: { ...(s.channels || {}), [k]: v } }));
  const setTemplate = (k: string, v: string) => setSettings((s: any) => ({ ...s, templates: { ...s.templates, [k]: v } }));

  return (
    <div className="space-y-6">
      <PageHeader title="مركز الإشعارات" />

      <div className="overflow-hidden rounded-[28px] border bg-gradient-to-l from-primary/15 via-background to-background p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black">إدارة إشعارات المشتركين</h1>
                <p className="text-sm text-muted-foreground">Push خارجي + إشعارات داخل التطبيق + سجل متابعة كامل</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { stats.refetch(); pushLogs.refetch(); }}>
              <RefreshCw className="ml-2 h-4 w-4" />
              تحديث
            </Button>
            <Button onClick={() => autoMutation.mutate()} disabled={autoMutation.isPending}>
              <Clock className="ml-2 h-4 w-4" />
              تشغيل الفحص الآن
            </Button>
          </div>
        </div>
      </div>

      {stats.isLoading ? <Loader /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="الأجهزة الفعالة" value={money(stats.data?.stats?.activeDevices)} icon={Smartphone} />
          <StatCard title="المشتركين" value={money(stats.data?.stats?.subscribers)} icon={Users} tone="amber" />
          <StatCard title="كل الأجهزة" value={money(stats.data?.stats?.totalDevices)} icon={BellRing} />
          <StatCard title="آخر الحملات" value={money(stats.data?.campaigns?.length)} icon={Send} tone="green" />
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2 md:grid-cols-4 xl:grid-cols-7">
          <TabsTrigger value="overview" className="rounded-xl">نظرة عامة</TabsTrigger>
          <TabsTrigger value="campaigns" className="rounded-xl">إرسال</TabsTrigger>
          <TabsTrigger value="auto" className="rounded-xl">التلقائي</TabsTrigger>
          <TabsTrigger value="expiry" className="rounded-xl">الانتهاء</TabsTrigger>
          <TabsTrigger value="debt" className="rounded-xl">الديون</TabsTrigger>
          <TabsTrigger value="templates" className="rounded-xl">القوالب</TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl">السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  ملخص السجل
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <StatCard title="إجمالي السجل" value={money(summary.total)} icon={History} />
                <StatCard title="وصل" value={money(summary.sent)} icon={CheckCircle2} tone="green" />
                <StatCard title="فشل" value={money(summary.failed)} icon={XCircle} tone="red" />
                <StatCard title="مالية" value={money(financialTotal)} icon={Wallet} tone="amber" />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>آخر الإشعارات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pushLogs.isLoading ? <Loader /> : recentRows.length ? recentRows.map((x: any) => (
                  <div key={x.id} className="rounded-2xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold">{x.title}</div>
                      <Badge variant={x.status === 'sent' ? 'default' : 'destructive'}>
                        {x.status === 'sent' ? 'وصل' : 'فشل'}
                      </Badge>
                    </div>
                    <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">{x.message}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{new Date(x.createdAt).toLocaleString('ar-IQ')}</div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">لا توجد بيانات بعد.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns">
          <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  إرسال حملة إشعارات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>العنوان</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>الرابط عند الضغط</Label>
                    <Input dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>نص الإشعار</Label>
                  <Textarea rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="اكتب رسالة واضحة وقصيرة..." />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>الهدف</Label>
                    <Select value={form.targetType} onValueChange={(v) => { setForm({ ...form, targetType: v, targetValue: '' }); setSelectedPhones([]); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المشتركين</SelectItem>
                        <SelectItem value="phone">مشتركون محددون</SelectItem>
                        <SelectItem value="debt">ديون</SelectItem>
                        <SelectItem value="expire_days">ينتهي خلال أيام</SelectItem>
                        <SelectItem value="expired">منتهين</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>{form.targetType === 'phone' ? 'المشتركين المختارين' : 'القيمة'}</Label>
                    {form.targetType === 'phone' ? (
                      <div className="rounded-2xl border bg-muted/20 p-3">
                        <div className="text-sm font-bold">{selectedPhones.length} مشترك مختار</div>
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {selectedPhones.length ? selectedPhones.join('، ') : 'لم يتم اختيار مشتركين بعد'}
                        </div>
                      </div>
                    ) : (
                      <Input
                        disabled={form.targetType === 'all' || form.targetType === 'expired'}
                        value={form.targetValue}
                        onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                        placeholder="مثلاً 3 أو 10000"
                      />
                    )}
                  </div>
                </div>
                {form.targetType === 'phone' && (
                  <div className="rounded-[28px] border bg-background p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xl font-black">اختيار المشتركين</div>
                        <div className="text-sm text-muted-foreground">
                          اختر من الأجهزة المسجلة بالإشعارات مع عرض الحسابات والدين لنفس الرقم
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">مختار {selectedPhones.length}</Badge>
                        <Badge variant="secondary">القائمة حسب قناة الإرسال</Badge>
                      <Badge variant="outline">المعروض {(pushSubscribers.data || []).filter((sub: any) => subscriberFilter === 'all' || (subscriberFilter === 'debt' && isWantedSub(sub)) || (subscriberFilter === 'near' && isNearExpirySub(sub)) || (subscriberFilter === 'expired' && isExpiredSub(sub)) || (subscriberFilter === 'multi' && Number(sub.accountsCount || 0) > 1)).length}</Badge>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-12 rounded-2xl pr-9"
                        placeholder="بحث بالاسم أو الرقم..."
                        value={subscriberSearch}
                        onChange={(e) => setSubscriberSearch(e.target.value)}
                      />
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[
                        { value: 'all', label: 'الكل' },
                        { value: 'debt', label: 'المطلوبين' },
                        { value: 'near', label: 'قريب الانتهاء' },
                        { value: 'expired', label: 'المنتهين' },
                        { value: 'multi', label: 'متعدد الحسابات' },
                      ].map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setSubscriberFilter(f.value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                            subscriberFilter === f.value
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border bg-muted/20">
                      {pushSubscribers.isLoading ? (
                        <div className="p-6"><Loader /></div>
                      ) : (pushSubscribers.data || []).length ? (
                        (pushSubscribers.data || [])
                          .filter((sub: any) =>
                            subscriberFilter === 'all' ||
                            (subscriberFilter === 'debt' && isWantedSub(sub)) ||
                            (subscriberFilter === 'near' && isNearExpirySub(sub)) ||
                            (subscriberFilter === 'expired' && isExpiredSub(sub)) ||
                            (subscriberFilter === 'multi' && Number(sub.accountsCount || 0) > 1)
                          )
                          .map((sub: any) => {
                          const phone = sub.phoneNorm || sub.phone;
                          const checked = selectedPhones.includes(phone);
                          const debt = Number(sub.totalDebt || 0);
                          const accountNames = String(sub.accountsLabel || '')
                            .split('،')
                            .map((x) => x.trim())
                            .filter(Boolean);
                          const uniqueNames = Array.from(new Set(accountNames)).slice(0, 4);

                          return (
                            <button
                              key={phone}
                              type="button"
                              onClick={() => {
                                setSelectedPhones((prev) => checked ? prev.filter((x) => x !== phone) : [...prev, phone]);
                              }}
                              className={`group w-full border-b px-3 py-2 text-start transition last:border-b-0 ${checked ? 'bg-primary/10' : 'hover:bg-background'}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="min-w-0 truncate text-sm font-black">
                                      {sub.name || 'مشترك'}
                                    </div>
                                    {Number(sub.accountsCount || 0) > 1 && (
                                      <Badge variant="secondary" className="shrink-0">
                                        متعدد
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                    {phone}
                                  </div>

                                  {uniqueNames.length > 0 && (
                                    <div className="mt-2 rounded-xl bg-background/70 p-2 text-xs text-muted-foreground">
                                      <div className="mb-1 font-bold text-foreground">الحسابات المرتبطة:</div>
                                      <div className="line-clamp-2">
                                        {uniqueNames.join('، ')}
                                      </div>
                                    </div>
                                  )}

                                  {!!sub.accounts?.length && (
                                    <div className="mt-3 space-y-2 rounded-xl bg-background/80 p-2">
                                      <div className="text-xs font-black">تفاصيل الحسابات:</div>
                                      {sub.accounts.slice(0, 6).map((a: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2 py-1 text-xs">
                                          <div className="min-w-0">
                                            <div className="truncate font-bold">{a.name}</div>
                                            <div className="text-muted-foreground">
                                              {a.package || '—'}
                                              {a.expiration ? ` • ${new Date(a.expiration).toLocaleDateString('ar-IQ')}` : ''}
                                            </div>
                                          </div>
                                          <div className={Number(a.debt || 0) > 0 ? 'shrink-0 font-black text-red-600' : 'shrink-0 font-black text-emerald-600'}>
                                            {Number(a.debt || 0).toLocaleString('en-US')} د.ع
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    <Badge variant="outline">
                                      الحسابات: {Number(sub.accountsCount || 0) || 1}
                                    </Badge>

                                    <Badge variant="outline" className={debtTone(debt)}>
                                      الدين: {debt.toLocaleString('en-US')} د.ع
                                    </Badge>

                                    <Badge variant={sub.pushEnabled ? 'default' : 'destructive'}>
                                      {sub.pushEnabled ? `مفعل ${sub.devices || 1}` : 'غير مفعل'}
                                    </Badge>
                                  </div>
                                </div>

                                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-black ${checked ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-transparent group-hover:text-muted-foreground'}`}>
                                  ✓
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">
                          لا توجد نتائج مطابقة.
                        </div>
                      )}
                    </div>
                  </div>
                )}


                
                <div className="grid gap-2">
                  <Label>قناة الإرسال</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر قناة الإرسال" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">تطبيق / Push فقط</SelectItem>
                      <SelectItem value="whatsapp">واتساب فقط</SelectItem>
                      <SelectItem value="both">تطبيق + واتساب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

<Button className="h-12 w-full md:w-auto" disabled={sendMutation.isPending || !form.title.trim() || !form.message.trim() || (form.targetType === 'phone' && selectedPhones.length === 0)} onClick={() => sendMutation.mutate()}>
                  <Send className="ml-2 h-4 w-4" />
                  {sendMutation.isPending ? 'جاري الإرسال...' : 'إرسال الآن'}
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>آخر الحملات</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(stats.data?.campaigns || []).slice(0, 8).map((x: any) => (
                  <div key={x.id} className="rounded-2xl border bg-muted/20 p-3">
                    <div className="font-bold">{x.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.message}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{targetLabels[x.targetType] || x.targetType}</Badge>
                      <Badge variant="outline">وصل {x.sentCount}</Badge>
                      <Badge variant={Number(x.failedCount) ? 'destructive' : 'outline'}>فشل {x.failedCount}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{new Date(x.createdAt).toLocaleString('ar-IQ')}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="auto">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                الإشعارات التلقائية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-base font-black">تشغيل النظام التلقائي</Label>
                    <div className="mt-1 text-xs text-muted-foreground">
                      إذا مطفأ، لا يرسل أي إشعار تلقائي.
                    </div>
                  </div>
                  <Switch checked={!!settings.auto?.enabled} onCheckedChange={(v) => setAuto('enabled', v)} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ['activation', 'onActivation', 'عند تفعيل الاشتراك'],
                  ['renewal', 'onRenewal', 'عند تجديد الاشتراك'],
                  ['payment', 'onPayment', 'عند إضافة دفعة'],
                  ['debt', 'onDebt', 'عند إضافة دين'],
                  ['expiryBefore', 'enabled', 'قرب الانتهاء'],
                  ['expired', 'enabled', 'بعد الانتهاء'],
                  ['ticketCreated', 'onTicketCreated', 'عند إنشاء تذكرة'],
                  ['ticketReply', 'onTicketReply', 'عند الرد على التذكرة'],
                  ['ticketStatus', 'onTicketStatus', 'عند تغيير حالة التذكرة'],
                  ['ticketClosed', 'onTicketClosed', 'عند إغلاق التذكرة'],
                ].map(([channelKey, toggleKey, label]: any) => (
                  <div key={channelKey} className="rounded-2xl border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <Label className="font-bold">{label}</Label>
                      {!['expiryBefore', 'expired'].includes(channelKey) && (
                        <Switch checked={!!settings.auto?.[toggleKey]} onCheckedChange={(v) => setAuto(toggleKey, v)} />
                      )}
                    </div>

                    <ChannelSelect
                      value={settings.channels?.[channelKey] || 'push'}
                      onChange={(v: string) => setChannel(channelKey, v)}
                    />

                    <div className="mt-2 text-xs text-muted-foreground">
                      الحالي: {channelLabel(settings.channels?.[channelKey] || 'push')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ الإعدادات</Button>
                <Button variant="outline" onClick={() => autoMutation.mutate()} disabled={autoMutation.isPending}>
                  <Clock className="ml-2 h-4 w-4" />
                  تشغيل الفحص الآن
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>إعدادات الانتهاء</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label>قبل الانتهاء بالأيام</Label>
                <Input className="mt-2" value={(settings.expiry?.beforeDays || []).join(', ')} onChange={(e) => setSettings((s: any) => ({ ...s, expiry: { ...s.expiry, beforeDays: parseNums(e.target.value) } }))} />
                <p className="mt-2 text-xs text-muted-foreground">مثال: 7, 3, 1</p>
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label>بعد الانتهاء بالأيام</Label>
                <Input className="mt-2" value={(settings.expiry?.afterDays || []).join(', ')} onChange={(e) => setSettings((s: any) => ({ ...s, expiry: { ...s.expiry, afterDays: parseNums(e.target.value) } }))} />
                <p className="mt-2 text-xs text-muted-foreground">مثال: 1, 3</p>
              </div>

              <div className="md:col-span-2">
                <Button onClick={() => saveMutation.mutate()}>حفظ إعدادات الانتهاء</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                إعدادات الديون
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center justify-between rounded-2xl border bg-muted/20 p-4">
                <Label className="font-bold">تفعيل إشعارات الديون</Label>
                <Switch checked={!!settings.debt?.enabled} onCheckedChange={(v) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, enabled: v } }))} />
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label>أقل مبلغ دين</Label>
                <Input className="mt-2" type="number" value={settings.debt?.minAmount || 0} onChange={(e) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, minAmount: Number(e.target.value) } }))} />
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label>تكرار التذكير / يوم</Label>
                <Input className="mt-2" type="number" value={settings.debt?.repeatDays || 7} onChange={(e) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, repeatDays: Number(e.target.value) } }))} />
              </div>

              <div className="md:col-span-3">
                <Button onClick={() => saveMutation.mutate()}>حفظ إعدادات الديون</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                قوالب الإشعارات
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-2xl border bg-primary/5 p-4">
                <div className="mb-3 text-lg font-black">ترميزات القوالب</div>
                <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['{name}', 'اسم المشترك'],
                    ['{phone}', 'رقم الهاتف'],
                    ['{pppoe}', 'يوزر الاشتراك'],
                    ['{package}', 'فئة الاشتراك'],
                    ['{packagePrice}', 'سعر الباقة'],
                    ['{amount}', 'مبلغ العملية'],
                    ['{paid}', 'المبلغ المدفوع'],
                    ['{debt}', 'قيمة الدين الجديد'],
                    ['{totalDebt}', 'إجمالي الدين'],
                    ['{remaining}', 'المبلغ المتبقي'],
                    ['{receipt}', 'رقم الوصل'],
                    ['{transactionId}', 'رقم العملية'],
                    ['{date}', 'التاريخ'],
                    ['{expireDate}', 'تاريخ الانتهاء'],
                    ['{days}', 'عدد الأيام'],
                    ['{status}', 'الحالة'],
                    ['{type}', 'نوع العملية'],
                    ['{company}', 'اسم الشركة'],
                    ['{today}', 'تاريخ اليوم'],
                    ['{time}', 'الوقت الحالي'],
                    ['{datetime}', 'التاريخ والوقت'],
                  ].map(([code, desc]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(code)}
                      className="rounded-xl border bg-background p-2 text-start hover:bg-muted"
                      title="اضغط للنسخ"
                    >
                      <code dir="ltr" className="font-black text-primary">{code}</code>
                      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  اضغط على أي ترميز حتى ينسخ، وبعدها الصقه داخل القالب.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(settings.templates || {}).map(([k, v]: any) => (
                  <div key={k} className="rounded-2xl border bg-muted/20 p-4">
                    <Label className="font-mono text-xs">{k}</Label>
                    <Textarea className="mt-2" rows={5} value={v} onChange={(e) => setTemplate(k, e.target.value)} />
                  </div>
                ))}
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                حفظ القوالب
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="إجمالي السجل" value={money(summary.total)} icon={History} />
              <StatCard title="الناجحة" value={money(summary.sent)} icon={CheckCircle2} tone="green" />
              <StatCard title="الفاشلة" value={money(summary.failed)} icon={XCircle} tone="red" />
              <StatCard title="مالية" value={money(financialTotal)} icon={Wallet} tone="amber" />
            </div>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  فلترة السجل
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_180px_120px]">
                <Input placeholder="بحث بالرقم، العنوان، النص..." value={logFilters.q} onChange={(e) => setLogFilters({ ...logFilters, q: e.target.value })} />

                <Select value={logFilters.status} onValueChange={(v) => setLogFilters({ ...logFilters, status: v })}>
                  <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="sent">وصل</SelectItem>
                    <SelectItem value="failed">فشل</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={logFilters.type} onValueChange={(v) => setLogFilters({ ...logFilters, type: v })}>
                  <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={() => pushLogs.refetch()}>
                  تحديث
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>سجل الإشعارات</CardTitle></CardHeader>
              <CardContent>
                {pushLogs.isLoading ? <Loader /> : rows.length ? (
                  <div className="overflow-hidden rounded-2xl border">
                    <div className="hidden grid-cols-[140px_1fr_140px_140px_180px] gap-3 bg-muted/60 p-3 text-sm font-bold text-muted-foreground md:grid">
                      <div>الحالة</div>
                      <div>الإشعار</div>
                      <div>الهاتف</div>
                      <div>النوع</div>
                      <div>الوقت</div>
                    </div>

                    <div className="divide-y">
                      {rows.map((x: any) => (
                        <div key={x.id} className="grid gap-3 p-4 md:grid-cols-[140px_1fr_140px_140px_180px] md:items-center">
                          <div>
                            <Badge variant={x.status === 'sent' ? 'default' : 'destructive'}>
                              {x.status === 'sent' ? 'وصل' : 'فشل'}
                            </Badge>
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-bold">{x.title}</div>
                            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.message}</div>
                            {x.error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{x.error}</div>}
                          </div>

                          <div className="font-mono text-sm">{x.phone || '—'}</div>
                          <div><Badge variant="secondary">{niceType(x.targetType)}</Badge></div>
                          <div className="text-sm text-muted-foreground">{new Date(x.createdAt).toLocaleString('ar-IQ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border p-8 text-center text-muted-foreground">
                    لا توجد إشعارات مطابقة للفلاتر الحالية.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
