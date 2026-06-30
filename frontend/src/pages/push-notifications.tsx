import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  MessageCircle,
  Sparkles,
  PlayCircle,
  StopCircle,
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

const installAppTemplate = `{rand:عزيزي المشترك|تحية طيبة|أهلاً بك}

📱 تطبيق المشترك الجديد من البرق الرقمي صار متاح الآن.

من خلال التطبيق تكدر تتابع:
✅ حالة الاشتراك
✅ تاريخ الانتهاء
✅ الديون والدفعات
✅ الإشعارات والتنبيهات
✅ التذاكر الفنية

رابط التطبيق:
user.albarq.app

بعد فتح الرابط اختر:
إضافة إلى الشاشة الرئيسية

{rand:شكراً لثقتكم|نتشرف بخدمتكم|البرق الرقمي بخدمتكم دائماً}`;

const defaultSettings: any = {
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
    installApp: installAppTemplate,
  },
};

function money(v: any) {
  return Number(v || 0).toLocaleString('en-US');
}

function parseNums(v: string) {
  return v.split(/[,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0);
}

function daysUntil(v: any) {
  if (!v) return null;
  const d = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  return Number.isFinite(d) ? d : null;
}

function channelLabel(v: any) {
  const x = String(v || 'push');
  if (x === 'whatsapp') return 'واتساب';
  if (x === 'twilio_template') return 'قالب Twilio';
  if (x === 'both' || x === 'all') return 'تطبيق + واتساب';
  if (x === 'off') return 'متوقف';
  return 'تطبيق';
}

function niceType(v: any) {
  const x = String(v || '');
  if (x.includes('payment')) return 'تسديد';
  if (x.includes('debt')) return 'ديون';
  if (x.includes('activation')) return 'تفعيل';
  if (x.includes('expired')) return 'منتهي';
  if (x.includes('expiry')) return 'قرب انتهاء';
  if (x.includes('ticket')) return 'تذاكر';
  if (x.includes('whatsapp')) return 'واتساب';
  return 'يدوي';
}

function renderRandPreview(text: string) {
  return String(text || '').replace(/\{rand:([^}]+)\}/g, (_m, body) => {
    const parts = String(body).split('|').map((x) => x.trim()).filter(Boolean);
    return parts[0] || '';
  });
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

function ChannelSelect({ value, onChange }: any) {
  return (
    <Select value={String(value || 'push')} onValueChange={onChange}>
      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="push">تطبيق فقط</SelectItem>
        <SelectItem value="whatsapp">واتساب نص عادي</SelectItem>
        <SelectItem value="twilio_template">قالب Twilio</SelectItem>
        <SelectItem value="both">تطبيق + واتساب</SelectItem>
        <SelectItem value="off">متوقف</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function PushNotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: 'إشعار من البرق',
    message: '',
    targetType: 'all',
    targetValue: '',
    url: '/my',
    channel: 'whatsapp',
  });

  const [settings, setSettings] = useState<any>(defaultSettings);
  const [logFilters, setLogFilters] = useState({ q: '', status: 'all', type: 'all' });
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [subscriberFilter, setSubscriberFilter] = useState('all');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [jobId, setJobId] = useState('');
  const [twilioTemplates, setTwilioTemplates] = useState<any[]>([]);
  const [twilioTemplateForm, setTwilioTemplateForm] = useState<any>({
    name: '',
    contentSid: '',
    variables: '1:name',
  });
  const [selectedTwilioTemplateId, setSelectedTwilioTemplateId] = useState('');
  const [twilioVariablesText, setTwilioVariablesText] = useState('1=مشترك');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewToken, setPreviewToken] = useState('');


  const stats = useQuery({ queryKey: ['pushStats'], queryFn: pushNotificationsApi.stats, refetchInterval: 15000 });
  const pushLogs = useQuery({
    queryKey: ['pushLogs', logFilters],
    queryFn: () => pushNotificationsApi.logs(logFilters),
    refetchInterval: 7000,
  });
  const settingsQuery = useQuery({ queryKey: ['pushSettings'], queryFn: pushNotificationsApi.settings });
  const pushSubscribers = useQuery({
    queryKey: ['pushSubscribers', subscriberSearch, form.channel],
    queryFn: () => pushNotificationsApi.subscribers(subscriberSearch, form.channel),
    refetchInterval: 30000,
  });
  const campaignJobsQuery = useQuery({
    queryKey: ['campaignJobs'],
    queryFn: pushNotificationsApi.campaignJobs,
    refetchInterval: 2000,
  });

  const jobQuery = useQuery({
    queryKey: ['campaignJob', jobId],
    queryFn: () => pushNotificationsApi.campaignJob(jobId),
    enabled: !!jobId,
    refetchInterval: (q: any) => {
      const st = q?.state?.data?.job?.status;
      return st === 'done' || st === 'failed' || st === 'cancelled' ? false : 1500;
    },
  });

  useEffect(() => {
    pushNotificationsApi.twilioTemplates()
      .then((d: any) => setTwilioTemplates(d.templates || []))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings({
        ...defaultSettings,
        ...settingsQuery.data,
        templates: {
          ...defaultSettings.templates,
          ...(settingsQuery.data.templates || {}),
          installApp: settingsQuery.data.templates?.installApp || installAppTemplate,
        },
      });
    }
  }, [settingsQuery.data]);

  const summary = pushLogs.data?.summary || {};
  const rows = pushLogs.data?.rows || [];
  const job = jobQuery.data?.job;
  const jobPercent = job?.total ? Math.round((Number(job.processed || 0) / Number(job.total || 1)) * 100) : 0;

  const setAuto = (k: string, v: boolean) => setSettings((s: any) => ({ ...s, auto: { ...s.auto, [k]: v } }));
  const setChannel = (k: string, v: string) => setSettings((s: any) => ({ ...s, channels: { ...(s.channels || {}), [k]: v } }));
  const setTemplate = (k: string, v: string) => setSettings((s: any) => ({ ...s, templates: { ...s.templates, [k]: v } }));

  const systemVarCatalog = [
    ['{name}', 'اسم المشترك'],
    ['{phone}', 'رقم الهاتف'],
    ['{pppoe}', 'يوزر الاشتراك'],
    ['{username}', 'يوزر الاشتراك'],
    ['{package}', 'الباقة'],
    ['{status}', 'حالة الاشتراك'],
    ['{expiration}', 'تاريخ انتهاء الاشتراك'],
    ['{debt}', 'الدين / المبلغ المستحق'],
    ['{amount}', 'المبلغ'],
    ['{balance}', 'الرصيد'],
    ['{due}', 'الاستحقاق'],
    ['{daysLeft}', 'الأيام المتبقية'],
    ['{daysExpired}', 'أيام الانتهاء'],
    ['{today}', 'تاريخ اليوم'],
    ['{company}', 'اسم الشركة'],
    ['{appUrl}', 'رابط تطبيق المشترك'],
    ['{supportPhone}', 'رقم الدعم'],
  ];



  async function saveTwilioTemplateList(next: any[]) {
    const d = await pushNotificationsApi.saveTwilioTemplates(next);
    setTwilioTemplates(d.templates || next);
    toast({ title: 'تم الحفظ', description: 'تم حفظ قوالب Twilio' });
  }


  async function syncTwilioTemplateList() {
    const d = await pushNotificationsApi.syncTwilioTemplates();
    setTwilioTemplates(d.templates || []);
    toast({
      title: 'تم جلب القوالب',
      description: `تم جلب المعتمدة فقط: ${d.approved} من أصل ${d.total}`,
    });
  }

  async function addTwilioTemplate() {
    const name = String(twilioTemplateForm.name || '').trim();
    const contentSid = String(twilioTemplateForm.contentSid || '').trim();
    const variables = String(twilioTemplateForm.variables || '')
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (!name || !contentSid) {
      toast({ title: 'تنبيه', description: 'اكتب اسم القالب و Content SID' });
      return;
    }

    const next = [
      ...twilioTemplates,
      { id: crypto.randomUUID(), name, contentSid, variables },
    ];
    await saveTwilioTemplateList(next);
    setTwilioTemplateForm({ name: '', contentSid: '', variables: '1:name' });
  }

  async function removeTwilioTemplate(id: string) {
    await saveTwilioTemplateList(twilioTemplates.filter((x) => x.id !== id));
  }


  const filteredSubscribers = useMemo(() => {
    const list = pushSubscribers.data || [];
    return list.filter((sub: any) => {
      const accounts = sub.accounts || [];
      const hasDebt = Number(sub.totalDebt || 0) > 0;
      const near = accounts.some((a: any) => {
        const d = daysUntil(a.expiration);
        return d !== null && d >= 0 && d <= 7;
      });
      const expired = accounts.some((a: any) => {
        const d = daysUntil(a.expiration);
        return d !== null && d < 0;
      });
      const multi = Number(sub.accountsCount || 0) > 1;

      return subscriberFilter === 'all' ||
        (subscriberFilter === 'debt' && hasDebt) ||
        (subscriberFilter === 'near' && near) ||
        (subscriberFilter === 'expired' && expired) ||
        (subscriberFilter === 'multi' && multi);
    });
  }, [pushSubscribers.data, subscriberFilter]);

  const previewMutation = useMutation({
    mutationFn: () => pushNotificationsApi.previewCampaign({
      ...(form.targetType === 'phone' ? { ...form, targetValue: selectedPhones.join(',') } : form),
      twilioTemplateId: selectedTwilioTemplateId,
      twilioVariablesText,
    }),
    onSuccess: (data: any) => {
      setPreviewRows(data.rows || []);
      setPreviewToken(data.previewToken || '');
      toast({
        title: 'تم تجهيز المعاينة',
        description: `تم تجهيز ${data.rows?.length || 0} رسالة بدون تكرار.`,
      });
    },
  });

  const confirmSendMutation = useMutation({
    mutationFn: () => pushNotificationsApi.confirmCampaign({ previewToken }),
    onSuccess: (data: any) => {
      if (data.jobId) setJobId(data.jobId);
      setPreviewRows([]);
      setPreviewToken('');
      toast({ title: 'بدأ الإرسال', description: 'تم اعتماد الرسائل بعد المعاينة.' });
      qc.invalidateQueries({ queryKey: ['pushStats'] });
      qc.invalidateQueries({ queryKey: ['pushLogs'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => pushNotificationsApi.saveSettings(settings),
    onSuccess: () => {
      toast({ title: 'تم حفظ الإعدادات والقوالب' });
      qc.invalidateQueries({ queryKey: ['pushSettings'] });
    },
  });

  const autoMutation = useMutation({
    mutationFn: pushNotificationsApi.runAuto,
    onSuccess: () => {
      toast({ title: 'تم تشغيل الفحص التلقائي' });
      qc.invalidateQueries({ queryKey: ['pushStats'] });
      qc.invalidateQueries({ queryKey: ['pushLogs'] });
    },
  });

  const applyTemplate = (key: string) => {
    setSelectedTemplateKey(key);
    if (!key || key === 'none') return;

    if (key.startsWith('twilio:')) {
      const id = key.replace('twilio:', '');
      const tpl = twilioTemplates.find((x: any) => x.id === id || x.contentSid === id);
      if (!tpl) return;

      setSelectedTwilioTemplateId(tpl.id || tpl.contentSid);
      setForm((f) => ({ ...f, channel: 'twilio_template', message: tpl.body || '' }));

      // لا نغير المتغيرات هنا حتى تبقى القيم التي كتبها المستخدم هي المعتمدة
      return;
    }

    setForm((f) => ({ ...f, message: String(settings.templates?.[key] || '') }));
  };

  const insertRand = () => {
    setForm((f) => ({
      ...f,
      message: `${f.message || ''}${f.message ? '\n' : ''}{rand:عزيزي المشترك|تحية طيبة|أهلاً بك}`,
    }));
  };

  const insertVar = (code: string) => setForm((f) => ({ ...f, message: `${f.message || ''}${f.message ? ' ' : ''}${code}` }));

  return (
    <div className="space-y-6">
      <PageHeader title="مركز الإشعارات والحملات" />

      <div className="overflow-hidden rounded-[30px] border bg-gradient-to-l from-primary/15 via-background to-background p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-sm">
              <BellRing className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-black">منصة الإرسال الذكي</h1>
              <p className="text-sm text-muted-foreground">
                حملات واتساب + Push + قوالب ذكية + عداد مباشر + سجل موحد.
              </p>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="أجهزة التطبيق" value={money(stats.data?.stats?.activeDevices)} icon={Smartphone} />
          <StatCard title="مشتركين Push" value={money(stats.data?.stats?.subscribers)} icon={Users} tone="amber" />
          <StatCard title="جلسات واتساب" value={money(stats.data?.stats?.whatsappConnected)} icon={MessageCircle} tone="green" />
          <StatCard title="واتساب اليوم" value={money(stats.data?.stats?.whatsappSentToday)} icon={Send} tone="green" />
          <StatCard title="فشل واتساب" value={money(stats.data?.stats?.whatsappFailedToday)} icon={XCircle} tone="red" />
        </div>
      )}

      {jobId && job && (
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-black">حملة قيد التنفيذ</div>
                <div className="text-sm text-muted-foreground">
                  {job.status} — الحالي: <span dir="ltr">{job.currentPhone || '—'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>الكلي {money(job.total)}</Badge>
                <Badge variant="secondary">تم {money(job.processed)}</Badge>
                <Badge variant="default">نجاح {money(job.sent)}</Badge>
                <Badge variant={Number(job.failed) ? 'destructive' : 'outline'}>فشل {money(job.failed)}</Badge>
              </div>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${jobPercent}%` }} />
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              <Badge variant="outline">Push ناجح {money(job.pushSent)}</Badge>
              <Badge variant="outline">Push فشل {money(job.pushFailed)}</Badge>
              <Badge variant="outline">واتساب ناجح {money(job.whatsappSent)}</Badge>
              <Badge variant="outline">واتساب فشل {money(job.whatsappFailed)}</Badge>
            </div>

            {job.status === 'running' && (
              <Button variant="destructive" onClick={() => pushNotificationsApi.cancelCampaignJob(jobId)}>
                <StopCircle className="ml-2 h-4 w-4" />
                إيقاف الحملة
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="campaigns" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2 md:grid-cols-4 xl:grid-cols-7">
          <TabsTrigger value="campaigns" className="rounded-xl">إرسال حملة</TabsTrigger>
          <TabsTrigger value="subscribers" className="rounded-xl">المشتركين</TabsTrigger>
          <TabsTrigger value="templates" className="rounded-xl">القوالب</TabsTrigger>
          <TabsTrigger value="auto" className="rounded-xl">التلقائي</TabsTrigger>
          <TabsTrigger value="expiry" className="rounded-xl">الانتهاء</TabsTrigger>
          <TabsTrigger value="debt" className="rounded-xl">الديون</TabsTrigger>
          <TabsTrigger value="campaignManager" className="rounded-xl">إدارة الحملات</TabsTrigger>
          <TabsTrigger value="twilio">قوالب Twilio</TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl">السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
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

                <div className="rounded-3xl border bg-muted/20 p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                    <div className="grid gap-2">
                      <Label>قالب جاهز</Label>
                      <Select value={selectedTemplateKey || 'none'} onValueChange={applyTemplate}>
                        <SelectTrigger><SelectValue placeholder="اختر قالب" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون قالب</SelectItem>
                          {Object.keys(settings.templates || {}).map((k) => (
                            <SelectItem key={k} value={k}>{k}</SelectItem>
                          ))}
                          {twilioTemplates.map((tpl: any) => (
                            <SelectItem key={`twilio-${tpl.id || tpl.contentSid}`} value={`twilio:${tpl.id || tpl.contentSid}`}>
                              {`Twilio - ${tpl.name}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" variant="outline" onClick={insertRand}>
                      <Sparkles className="ml-2 h-4 w-4" />
                      تدوير كلمات
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, message: installAppTemplate }))}>
                      قالب التطبيق
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {['{name}', '{phone}', '{pppoe}', '{package}', '{amount}', '{debt}', '{totalDebt}', '{remaining}', '{expireDate}', '{days}', '{company}'].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => insertVar(code)}
                        className="rounded-full border bg-background px-2.5 py-1 text-xs font-black text-primary hover:bg-muted"
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>نص الرسالة</Label>
                  <Textarea rows={9} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>

                <div className="rounded-3xl border bg-background p-4">
                  <div className="mb-2 text-sm font-black">معاينة أول نسخة</div>
                  <pre className="whitespace-pre-wrap rounded-2xl bg-muted/40 p-4 text-sm leading-7">{renderRandPreview(form.message || '—')}</pre>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>الهدف</Label>
                    <Select value={form.targetType} onValueChange={(v) => { setForm({ ...form, targetType: v, targetValue: '' }); setSelectedPhones([]); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المشتركين</SelectItem>
                        <SelectItem value="phone">مشتركين محددين</SelectItem>
                        <SelectItem value="debt">ديون</SelectItem>
                        <SelectItem value="expire_days">ينتهي خلال أيام</SelectItem>
                        <SelectItem value="expired">منتهين</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>القيمة</Label>
                    {form.targetType === 'phone' ? (
                      <div className="rounded-xl border bg-muted/20 px-3 py-2 text-sm font-bold">
                        مختار {selectedPhones.length}
                      </div>
                    ) : (
                      <Input
                        disabled={form.targetType === 'all' || form.targetType === 'expired'}
                        value={form.targetValue}
                        onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                        placeholder="مثلاً 7 أو 10000"
                      />
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label>قناة الإرسال</Label>
                    <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="push">تطبيق فقط</SelectItem>
                        <SelectItem value="whatsapp">واتساب نص عادي</SelectItem>
                        <SelectItem value="twilio_template">قالب Twilio</SelectItem>
                        <SelectItem value="both">تطبيق + واتساب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.targetType === 'phone' && (
                  <div className="rounded-3xl border bg-background p-4 shadow-sm">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-black">اختيار المشتركين</div>
                        <div className="text-sm text-muted-foreground">
                          اختر المشتركين المراد إرسال الرسالة لهم.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>المعروض {filteredSubscribers.length}</Badge>
                        <Badge variant="secondary">المحدد {selectedPhones.length}</Badge>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-12 rounded-2xl pr-9"
                        placeholder="بحث بالاسم أو الرقم أو اليوزر..."
                        value={subscriberSearch}
                        onChange={(e) => setSubscriberSearch(e.target.value)}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        ['all', 'الكل'],
                        ['debt', 'المطلوبين'],
                        ['near', 'قريب الانتهاء'],
                        ['expired', 'المنتهين'],
                        ['multi', 'متعدد الحسابات'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSubscriberFilter(value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                            subscriberFilter === value
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPhones(filteredSubscribers.map((x: any) => x.phoneNorm || x.phone).filter(Boolean))}
                      >
                        تحديد الكل
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPhones([])}
                      >
                        إلغاء التحديد
                      </Button>
                    </div>

                    <div className="mt-4 max-h-[420px] overflow-y-auto rounded-2xl border bg-muted/20">
                      {pushSubscribers.isLoading ? (
                        <div className="p-6"><Loader /></div>
                      ) : filteredSubscribers.length ? (
                        filteredSubscribers.map((sub: any) => {
                          const phone = sub.phoneNorm || sub.phone;
                          const checked = selectedPhones.includes(phone);
                          const nearDays = Math.min(
                            ...(sub.accounts || [])
                              .map((a: any) => daysUntil(a.expiration))
                              .filter((x: any) => x !== null)
                          );

                          return (
                            <button
                              key={phone}
                              type="button"
                              onClick={() => setSelectedPhones((prev) => checked ? prev.filter((x) => x !== phone) : [...prev, phone])}
                              className={`w-full border-b p-4 text-start last:border-b-0 ${checked ? 'bg-primary/10' : 'hover:bg-background'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-base font-black">{sub.name || 'مشترك'}</div>
                                  <div className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{phone}</div>

                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Badge variant="outline">حسابات {sub.accountsCount || 1}</Badge>
                                    <Badge variant={Number(sub.totalDebt || 0) > 0 ? 'destructive' : 'secondary'}>
                                      دين {money(sub.totalDebt)} د.ع
                                    </Badge>
                                    {Number.isFinite(nearDays) && (
                                      <Badge variant={nearDays < 0 ? 'destructive' : 'outline'}>
                                        {nearDays < 0 ? 'منتهي' : `ينتهي بعد ${nearDays} يوم`}
                                      </Badge>
                                    )}
                                    <Badge variant={sub.pushEnabled ? 'default' : 'outline'}>
                                      {sub.pushEnabled ? 'Push مفعل' : 'واتساب فقط'}
                                    </Badge>
                                  </div>
                                </div>

                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-black ${
                                  checked ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-transparent'
                                }`}>
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

                <Button
                  className="h-12 w-full text-base font-black"
                  disabled={previewMutation.isPending || !form.title.trim() || (form.channel !== 'twilio_template' && !form.message.trim()) || (form.channel === 'twilio_template' && !selectedTwilioTemplateId) || (form.targetType === 'phone' && selectedPhones.length === 0)}
                  onClick={() => previewMutation.mutate()}
                >
                  <PlayCircle className="ml-2 h-5 w-5" />
                  {previewMutation.isPending ? 'جاري تجهيز المعاينة...' : 'معاينة قبل الإرسال'}
                </Button>

                {previewRows.length > 0 && (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardHeader>
                      <CardTitle>معاينة الرسائل قبل الإرسال</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="max-h-[500px] overflow-y-auto rounded-2xl border bg-white">
                        {previewRows.map((x: any, i: number) => (
                          <div key={`${x.phone}-${i}`} className="border-b p-4 last:border-b-0">
                            <div className="mb-2 flex flex-wrap gap-2">
                              <Badge variant="outline">{i + 1}</Badge>
                              <Badge>{x.name || 'مشترك'}</Badge>
                              <Badge variant="secondary" dir="ltr">{x.phone}</Badge>
                              {x.duplicate && <Badge variant="destructive">مكرر وتم استبعاده</Badge>}
                            </div>

                            {form.channel === 'twilio_template' ? (
                              <pre className="whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-xs" dir="ltr">
                                {JSON.stringify(x.contentVariables, null, 2)}
                              </pre>
                            ) : (
                              <div className="whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-sm leading-7">
                                {x.message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <Button
                        className="h-12 w-full font-black"
                        disabled={!previewToken || confirmSendMutation.isPending}
                        onClick={() => confirmSendMutation.mutate()}
                      >
                        <Send className="ml-2 h-5 w-5" />
                        تأكيد وإرسال الرسائل المعروضة فقط
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setPreviewRows([]);
                          setPreviewToken('');
                        }}
                      >
                        إلغاء المعاينة
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>آخر الحملات</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(stats.data?.campaigns || []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="rounded-2xl border bg-muted/20 p-3">
                    <div className="font-bold">{x.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.message}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{channelLabel(String(x.targetType || '').split(':').pop())}</Badge>
                      <Badge variant="outline">نجاح {x.sentCount}</Badge>
                      <Badge variant={Number(x.failedCount) ? 'destructive' : 'outline'}>فشل {x.failedCount}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscribers">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                اختيار المشتركين
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input className="h-12 rounded-2xl pr-9" placeholder="بحث بالاسم أو الرقم أو اليوزر..." value={subscriberSearch} onChange={(e) => setSubscriberSearch(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ['all', 'الكل'],
                  ['debt', 'المطلوبين'],
                  ['near', 'قريب الانتهاء'],
                  ['expired', 'المنتهين'],
                  ['multi', 'متعدد الحسابات'],
                ].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setSubscriberFilter(value)} className={`rounded-full border px-4 py-2 text-xs font-black ${subscriberFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                    {label}
                  </button>
                ))}
                <Button variant="outline" size="sm" onClick={() => setSelectedPhones(filteredSubscribers.map((x: any) => x.phoneNorm || x.phone).filter(Boolean))}>
                  تحديد الكل المعروض
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedPhones([])}>
                  إلغاء التحديد
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge>المعروض {filteredSubscribers.length}</Badge>
                <Badge variant="secondary">المحدد {selectedPhones.length}</Badge>
              </div>

              <div className="max-h-[620px] overflow-y-auto rounded-2xl border bg-muted/20">
                {pushSubscribers.isLoading ? <div className="p-6"><Loader /></div> : filteredSubscribers.length ? filteredSubscribers.map((sub: any) => {
                  const phone = sub.phoneNorm || sub.phone;
                  const checked = selectedPhones.includes(phone);
                  const nearDays = Math.min(...(sub.accounts || []).map((a: any) => daysUntil(a.expiration)).filter((x: any) => x !== null));
                  return (
                    <button key={phone} type="button" onClick={() => setSelectedPhones((prev) => checked ? prev.filter((x) => x !== phone) : [...prev, phone])} className={`w-full border-b p-4 text-start last:border-b-0 ${checked ? 'bg-primary/10' : 'hover:bg-background'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-black">{sub.name || 'مشترك'}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{phone}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="outline">حسابات {sub.accountsCount || 1}</Badge>
                            <Badge variant={Number(sub.totalDebt || 0) > 0 ? 'destructive' : 'secondary'}>دين {money(sub.totalDebt)} د.ع</Badge>
                            {Number.isFinite(nearDays) && <Badge variant={nearDays < 0 ? 'destructive' : 'outline'}>{nearDays < 0 ? 'منتهي' : `ينتهي بعد ${nearDays} يوم`}</Badge>}
                            <Badge variant={sub.pushEnabled ? 'default' : 'outline'}>{sub.pushEnabled ? 'Push مفعل' : 'واتساب فقط'}</Badge>
                          </div>
                          {!!sub.accounts?.length && (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {sub.accounts.slice(0, 4).map((a: any, i: number) => (
                                <div key={i} className="rounded-xl bg-background/80 p-2 text-xs">
                                  <div className="truncate font-bold">{a.name}</div>
                                  <div className="text-muted-foreground">{a.package || '—'} {a.expiration ? `• ${new Date(a.expiration).toLocaleDateString('ar-IQ')}` : ''}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-black ${checked ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-transparent'}`}>
                          ✓
                        </div>
                      </div>
                    </button>
                  );
                }) : <div className="p-8 text-center text-muted-foreground">لا توجد نتائج.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> القوالب</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border bg-primary/5 p-4">
                <div className="font-black">تدوير الكلمات</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  اكتبها بهذا الشكل: <code dir="ltr">{'{rand:عزيزي المشترك|تحية طيبة|أهلاً بك}'}</code>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(settings.templates || {}).map(([k, v]: any) => (
                  <div key={k} className="rounded-2xl border bg-muted/20 p-4">
                    <Label className="font-mono text-xs">{k}</Label>
                    <Textarea className="mt-2" rows={7} value={v} onChange={(e) => setTemplate(k, e.target.value)} />
                  </div>
                ))}
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ القوالب</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auto">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> الإشعارات التلقائية</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-black">تشغيل النظام التلقائي</Label>
                    <div className="text-xs text-muted-foreground">يشمل التفعيل، التسديد، الديون، الانتهاء والتذاكر.</div>
                  </div>
                  <Switch checked={!!settings.auto?.enabled} onCheckedChange={(v) => setAuto('enabled', v)} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ['activation', 'onActivation', 'تفعيل الاشتراك'],
                  ['renewal', 'onRenewal', 'تجديد الاشتراك'],
                  ['payment', 'onPayment', 'تسديد دفعة'],
                  ['debt', 'onDebt', 'إضافة دين'],
                  ['expiryBefore', 'enabled', 'قرب الانتهاء'],
                  ['expired', 'enabled', 'بعد الانتهاء'],
                  ['ticketCreated', 'onTicketCreated', 'إنشاء تذكرة'],
                  ['ticketReply', 'onTicketReply', 'رد على تذكرة'],
                  ['ticketStatus', 'onTicketStatus', 'تغيير حالة تذكرة'],
                  ['ticketClosed', 'onTicketClosed', 'إغلاق تذكرة'],
                ].map(([channelKey, toggleKey, label]: any) => (
                  <div key={channelKey} className="rounded-2xl border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <Label className="font-bold">{label}</Label>
                      {!['expiryBefore', 'expired'].includes(channelKey) && (
                        <Switch checked={!!settings.auto?.[toggleKey]} onCheckedChange={(v) => setAuto(toggleKey, v)} />
                      )}
                    </div>
                    <ChannelSelect value={settings.channels?.[channelKey] || 'push'} onChange={(v: string) => setChannel(channelKey, v)} />
                    <div className="mt-2 text-xs text-muted-foreground">الحالي: {channelLabel(settings.channels?.[channelKey] || 'push')}</div>
                  </div>
                ))}
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ الإعدادات</Button>
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
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <Label>بعد الانتهاء بالأيام</Label>
                <Input className="mt-2" value={(settings.expiry?.afterDays || []).join(', ')} onChange={(e) => setSettings((s: any) => ({ ...s, expiry: { ...s.expiry, afterDays: parseNums(e.target.value) } }))} />
              </div>
              <div className="md:col-span-2"><Button onClick={() => saveMutation.mutate()}>حفظ</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> إعدادات الديون</CardTitle></CardHeader>
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
              <div className="md:col-span-3"><Button onClick={() => saveMutation.mutate()}>حفظ إعدادات الديون</Button></div>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="campaignManager">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                إدارة الحملات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {campaignJobsQuery.isLoading ? (
                <Loader />
              ) : (campaignJobsQuery.data?.jobs || []).length ? (
                <div className="space-y-3">
                  {(campaignJobsQuery.data?.jobs || []).map((j: any) => {
                    const percent = j.total ? Math.round((Number(j.processed || 0) / Number(j.total || 1)) * 100) : 0;
                    const remaining = Math.max(0, Number(j.total || 0) - Number(j.processed || 0));

                    return (
                      <div key={j.id} className="rounded-3xl border bg-muted/20 p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-lg font-black">{j.title}</div>
                              <Badge variant={
                                j.status === 'done' ? 'default' :
                                j.status === 'failed' || j.status === 'cancelled' ? 'destructive' :
                                j.status === 'paused' ? 'secondary' : 'outline'
                              }>
                                {j.status === 'running' ? 'قيد التنفيذ' :
                                 j.status === 'paused' ? 'متوقفة مؤقتاً' :
                                 j.status === 'cancelled' ? 'ملغية' :
                                 j.status === 'done' ? 'مكتملة' :
                                 j.status === 'failed' ? 'فاشلة' : j.status}
                              </Badge>
                              <Badge variant="outline">{channelLabel(j.channel)}</Badge>
                              <Badge variant="secondary">{niceType(j.targetType)}</Badge>
                            </div>

                            <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{j.message}</div>

                            <div className="mt-4 h-3 overflow-hidden rounded-full bg-background">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                            </div>

                            <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
                              <Badge variant="outline">الكلي {money(j.total)}</Badge>
                              <Badge variant="outline">تم {money(j.processed)}</Badge>
                              <Badge variant="outline">المتبقي {money(remaining)}</Badge>
                              <Badge variant="default">نجاح {money(j.sent)}</Badge>
                              <Badge variant={Number(j.failed) ? 'destructive' : 'outline'}>فشل {money(j.failed)}</Badge>
                              <Badge variant="outline">Push {money(j.pushSent)}/{money(j.pushFailed)}</Badge>
                              <Badge variant="outline">WA {money(j.whatsappSent)}/{money(j.whatsappFailed)}</Badge>
                              <Badge variant="secondary">{percent}%</Badge>
                            </div>

                            <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                              <div>آخر رقم: <span dir="ltr" className="font-mono">{j.currentPhone || '—'}</span></div>
                              <div>وقت البدء: {new Date(j.createdAt).toLocaleString('ar-IQ')}</div>
                              <div>آخر تحديث: {new Date(j.updatedAt).toLocaleString('ar-IQ')}</div>
                              <div>Job ID: <span dir="ltr" className="font-mono">{j.id}</span></div>
                            </div>

                            {j.error && (
                              <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-600">
                                {j.error}
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            {j.status === 'running' && (
                              <Button
                                variant="outline"
                                onClick={async () => {
                                  await pushNotificationsApi.pauseCampaignJob(j.id);
                                  campaignJobsQuery.refetch();
                                }}
                              >
                                إيقاف مؤقت
                              </Button>
                            )}

                            {j.status === 'paused' && (
                              <Button
                                onClick={async () => {
                                  await pushNotificationsApi.resumeCampaignJob(j.id);
                                  campaignJobsQuery.refetch();
                                }}
                              >
                                استئناف
                              </Button>
                            )}

                            {['running', 'paused', 'queued'].includes(j.status) && (
                              <Button
                                variant="destructive"
                                onClick={async () => {
                                  if (!confirm('متأكد تريد إلغاء هذه الحملة؟')) return;
                                  await pushNotificationsApi.cancelCampaignJob(j.id);
                                  campaignJobsQuery.refetch();
                                }}
                              >
                                إلغاء الحملة
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border p-8 text-center text-muted-foreground">
                  لا توجد حملات قيد الإدارة حالياً.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        
        <TabsContent value="twilio" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                قوالب Twilio WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>اسم القالب</Label>
                  <Input
                    value={twilioTemplateForm.name}
                    onChange={(e) => setTwilioTemplateForm((x: any) => ({ ...x, name: e.target.value }))}
                    placeholder="مثلاً: تنبيه انتهاء"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content SID</Label>
                  <Input
                    value={twilioTemplateForm.contentSid}
                    onChange={(e) => setTwilioTemplateForm((x: any) => ({ ...x, contentSid: e.target.value }))}
                    placeholder="HXxxxxxxxxxxxxxxxx"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>المتغيرات الافتراضية</Label>
                  <Input
                    value={twilioTemplateForm.variables}
                    onChange={(e) => setTwilioTemplateForm((x: any) => ({ ...x, variables: e.target.value }))}
                    placeholder="1:name,2:amount"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={syncTwilioTemplateList} className="rounded-xl bg-slate-900">
                  جلب القوالب المعتمدة من Twilio
                </Button>
                <Button onClick={addTwilioTemplate} variant="outline" className="rounded-xl">
                  إضافة يدوي
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {twilioTemplates.map((tpl) => (
                  <Card key={tpl.id} className="border-slate-200">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black">{tpl.name}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{tpl.contentSid}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeTwilioTemplate(tpl.id)}>
                          حذف
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {tpl.body && (
                          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-700 whitespace-pre-wrap">
                            {tpl.body}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {(tpl.variables || []).map((v: any) => (
                            <Badge key={typeof v === 'string' ? v : v.key} variant="secondary">
                              {typeof v === 'string' ? v : `${v.key}: ${v.hint || 'متغير'}`}
                            </Badge>
                          ))}
                        </div>

                        {(tpl.variables || []).length > 0 && (
                          <div className="rounded-xl border bg-white p-3 text-xs">
                            <div className="mb-2 font-black">دليل المتغيرات</div>
                            <div className="space-y-1">
                              {(tpl.variables || []).map((v: any) => (
                                <div key={typeof v === 'string' ? v : v.key} className="flex justify-between gap-3 border-b border-dashed pb-1 last:border-0">
                                  <span className="font-mono">{typeof v === 'string' ? v : v.key}</span>
                                  <span className="font-bold">{typeof v === 'string' ? 'متغير' : v.hint}</span>
                                  {typeof v !== 'string' && v.sample ? <span className="text-muted-foreground">مثال: {v.sample}</span> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>اختيار قالب Twilio للحملة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>القالب</Label>
                <Select value={selectedTwilioTemplateId} onValueChange={(id) => {
                  setSelectedTwilioTemplateId(id);
                  setForm((f) => ({ ...f, twilioTemplateId: id, channel: 'twilio_template' } as any));
                  // لا نغير المتغيرات هنا حتى لا نستبدل إدخال المستخدم
                }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر قالب" />
                  </SelectTrigger>
                  <SelectContent>
                    {twilioTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>الاستهداف</Label>
                <div className="text-sm text-muted-foreground">
                  يستخدم نفس الاستهداف الحالي من أعلى الصفحة:
                  <b className="mx-1">{form.targetType}</b>
                  {form.targetValue ? <span> / {form.targetValue}</span> : null}
                </div>
              </div>


              <Card className="lg:col-span-2 border-dashed bg-slate-50/70">
                <CardContent className="p-4">
                  <div className="mb-3 font-black">دليل رموز النظام</div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {systemVarCatalog.map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          const nextNumber = twilioVariablesText.split('\n').filter(Boolean).length + 1;
                          setTwilioVariablesText((v) => `${v}${v.endsWith('\n') || !v ? '' : '\n'}${nextNumber}=${code}`);
                        }}
                        className="flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-xs hover:bg-slate-100"
                      >
                        <span className="font-bold">{label}</span>
                        <code className="rounded bg-slate-100 px-2 py-1 text-left" dir="ltr">{code}</code>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {`مثال: إذا قالب Twilio يحتوي متغير رقم 1 للاسم ومتغير رقم 2 للدين، اكتب بالمتغيرات: 1={name} و 2={debt}.`}
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-2 lg:col-span-2">
                <Label>Content Variables</Label>
                <Textarea
                  value={twilioVariablesText}
                  onChange={(e) => {
                    setTwilioVariablesText(e.target.value);
                    setForm((f) => ({ ...f, twilioVariablesText: e.target.value } as any));
                  }}
                  className="min-h-[110px] font-mono"
                  dir="ltr"
                  placeholder={'1=أحمد\n2=15000\n3=2026-06-30'}
                />
                <p className="text-xs text-muted-foreground">
                  اكتب كل متغير بسطر: 1=القيمة، 2=القيمة. لازم يطابق متغيرات القالب المعتمد داخل Twilio.
                </p>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  تم تعطيل الإرسال المباشر من هنا. احفظ القالب واستخدمه من إعدادات الحملة حتى ما ينرسل بالغلط للكل.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

<TabsContent value="logs">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard title="إجمالي السجل" value={money(summary.total)} icon={History} />
              <StatCard title="ناجحة" value={money(summary.sent)} icon={CheckCircle2} tone="green" />
              <StatCard title="فاشلة" value={money(summary.failed)} icon={XCircle} tone="red" />
              <StatCard title="واتساب ناجح" value={money(summary.whatsappSent)} icon={MessageCircle} tone="green" />
              <StatCard title="واتساب فشل" value={money(summary.whatsappFailed)} icon={XCircle} tone="red" />
            </div>

            <Card className="shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> فلترة السجل</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_180px_120px]">
                <Input placeholder="بحث بالرقم أو النص أو الجلسة..." value={logFilters.q} onChange={(e) => setLogFilters({ ...logFilters, q: e.target.value })} />
                <Select value={logFilters.status} onValueChange={(v) => setLogFilters({ ...logFilters, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="sent">وصل</SelectItem>
                    <SelectItem value="failed">فشل</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={logFilters.type} onValueChange={(v) => setLogFilters({ ...logFilters, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    <SelectItem value="whatsapp">واتساب</SelectItem>
                    <SelectItem value="push">تطبيق</SelectItem>
                    <SelectItem value="payment">تسديد</SelectItem>
                    <SelectItem value="debt">دين</SelectItem>
                    <SelectItem value="activation">تفعيل</SelectItem>
                    <SelectItem value="expiry">انتهاء</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => pushLogs.refetch()}>تحديث</Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>سجل الرسائل والإشعارات</CardTitle></CardHeader>
              <CardContent>
                {pushLogs.isLoading ? <Loader /> : rows.length ? (
                  <div className="overflow-hidden rounded-2xl border">
                    <div className="hidden grid-cols-[110px_110px_1fr_140px_140px_180px] gap-3 bg-muted/60 p-3 text-sm font-bold text-muted-foreground md:grid">
                      <div>الحالة</div>
                      <div>القناة</div>
                      <div>الرسالة</div>
                      <div>الهاتف</div>
                      <div>النوع</div>
                      <div>الوقت</div>
                    </div>
                    <div className="divide-y">
                      {rows.map((x: any) => (
                        <div key={`${x.channel}-${x.id}-${x.createdAt}`} className="grid gap-3 p-4 md:grid-cols-[110px_110px_1fr_140px_140px_180px] md:items-center">
                          <div><Badge variant={x.status === 'sent' ? 'default' : 'destructive'}>{x.status === 'sent' ? 'وصل' : 'فشل'}</Badge></div>
                          <div><Badge variant={x.channel === 'whatsapp' ? 'secondary' : 'outline'}>{channelLabel(x.channel)}</Badge></div>
                          <div className="min-w-0">
                            <div className="truncate font-bold">{x.title}</div>
                            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.message}</div>
                            {x.sessionName && <div className="mt-1 text-xs text-muted-foreground">الجلسة: {x.sessionName}</div>}
                            {x.error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{x.error}</div>}
                          </div>
                          <div className="font-mono text-sm" dir="ltr">{x.phone || '—'}</div>
                          <div><Badge variant="secondary">{niceType(x.targetType)}</Badge></div>
                          <div className="text-sm text-muted-foreground">{new Date(x.createdAt).toLocaleString('ar-IQ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div className="rounded-2xl border p-8 text-center text-muted-foreground">لا توجد رسائل مطابقة.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
