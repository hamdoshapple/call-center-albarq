import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Send, Users, Smartphone, Settings, Clock, Wallet, FileText } from 'lucide-react';
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

const targetLabels: any = {
  all: 'إرسال عام',
  phone: 'مشتركين محددين',
  debt: 'المشتركين عليهم ديون',
  expire_days: 'قرب الانتهاء',
  expired: 'المنتهين',
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
  templates: {
    activation: 'تم تفعيل اشتراكك بنجاح.',
    renewal: 'تم تجديد اشتراكك بنجاح.',
    payment: 'تم تسجيل دفعة جديدة بقيمة {amount} د.ع.',
    debt: 'يوجد عليك مبلغ مستحق قدره {amount} د.ع.',
    expireBefore: 'اشتراكك سينتهي بعد {days} يوم.',
    expired: 'اشتراكك منتهي، يرجى التجديد لتجنب توقف الخدمة.',
    ticketCreated: 'تم إنشاء تذكرتك وسيتم متابعتها من الفريق.',
    ticketReply: 'يوجد رد جديد على تذكرتك.',
    ticketStatus: 'تم تحديث حالة التذكرة إلى: {status}.',
    general: 'لديك إشعار جديد من البرق الرقمي.',
  },
};

function parseNums(v: string) {
  return v.split(/[,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x >= 0);
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
  });

  const [settings, setSettings] = useState<any>(defaultSettings);

  const stats = useQuery({ queryKey: ['pushStats'], queryFn: pushNotificationsApi.stats });
  const pushLogs = useQuery({ queryKey: ['pushLogs'], queryFn: pushNotificationsApi.logs, refetchInterval: 15000 });
  const settingsQuery = useQuery({ queryKey: ['pushSettings'], queryFn: pushNotificationsApi.settings });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);

  const sendMutation = useMutation({
    mutationFn: () => pushNotificationsApi.send(form),
    onSuccess: (data) => {
      toast({ title: 'تم الإرسال', description: `وصل: ${data.sent} / فشل: ${data.failed}` });
      setForm((f) => ({ ...f, message: '' }));
      qc.invalidateQueries({ queryKey: ['pushStats'] });
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
      toast({ title: 'تم تشغيل الإرسال التلقائي', description: JSON.stringify(data.results || []) });
      qc.invalidateQueries({ queryKey: ['pushStats'] });
    },
  });

  const setAuto = (k: string, v: boolean) => setSettings((s: any) => ({ ...s, auto: { ...s.auto, [k]: v } }));
  const setTemplate = (k: string, v: string) => setSettings((s: any) => ({ ...s, templates: { ...s.templates, [k]: v } }));

  return (
    <div className="space-y-6">
      <PageHeader title="مركز إعدادات الإشعارات" />

      {stats.isLoading ? <Loader /> : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="flex items-center gap-3 pt-6"><Smartphone className="h-8 w-8 text-primary" /><div><div className="text-sm text-muted-foreground">الأجهزة الفعالة</div><div className="text-3xl font-bold">{Number(stats.data?.stats?.activeDevices || 0)}</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 pt-6"><Users className="h-8 w-8 text-primary" /><div><div className="text-sm text-muted-foreground">المشتركين</div><div className="text-3xl font-bold">{Number(stats.data?.stats?.subscribers || 0)}</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 pt-6"><BellRing className="h-8 w-8 text-primary" /><div><div className="text-sm text-muted-foreground">كل الأجهزة</div><div className="text-3xl font-bold">{Number(stats.data?.stats?.totalDevices || 0)}</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 pt-6"><Send className="h-8 w-8 text-primary" /><div><div className="text-sm text-muted-foreground">آخر الحملات</div><div className="text-3xl font-bold">{Number(stats.data?.campaigns?.length || 0)}</div></div></CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="campaigns">الحملات</TabsTrigger>
          <TabsTrigger value="auto">التلقائي</TabsTrigger>
          <TabsTrigger value="expiry">الانتهاء</TabsTrigger>
          <TabsTrigger value="debt">الديون</TabsTrigger>
          <TabsTrigger value="templates">القوالب</TabsTrigger>
          <TabsTrigger value="logs">السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card>
              <CardHeader><CardTitle>إرسال إشعار</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2"><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid gap-2"><Label>النص</Label><Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>الهدف</Label>
                    <Select value={form.targetType} onValueChange={(v) => setForm({ ...form, targetType: v, targetValue: '' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المشتركين</SelectItem>
                        <SelectItem value="phone">أرقام محددة</SelectItem>
                        <SelectItem value="debt">ديون</SelectItem>
                        <SelectItem value="expire_days">ينتهي خلال أيام</SelectItem>
                        <SelectItem value="expired">منتهين</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>القيمة</Label>
                    <Input disabled={form.targetType === 'all' || form.targetType === 'expired'} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-2"><Label>الرابط</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>

                <Button disabled={sendMutation.isPending || !form.title.trim() || !form.message.trim()} onClick={() => sendMutation.mutate()}>
                  <Send className="ml-2 h-4 w-4" />
                  {sendMutation.isPending ? 'جاري الإرسال...' : 'إرسال الآن'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>آخر الإرسالات</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(stats.data?.campaigns || []).map((x: any) => (
                  <div key={x.id} className="rounded-xl border p-3">
                    <div className="font-bold">{x.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{x.message}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
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
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> الإشعارات التلقائية</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {Object.entries({
                enabled: 'تشغيل النظام التلقائي',
                onActivation: 'عند تفعيل الاشتراك',
                onRenewal: 'عند تجديد الاشتراك',
                onPayment: 'عند إضافة دفعة',
                onDebt: 'عند إضافة دين',
                onTicketCreated: 'عند إنشاء تذكرة',
                onTicketReply: 'عند الرد على التذكرة',
                onTicketStatus: 'عند تغيير حالة التذكرة',
                onTicketClosed: 'عند إغلاق التذكرة',
              }).map(([k, label]) => (
                <div key={k} className="flex items-center justify-between rounded-xl border p-4">
                  <Label>{label}</Label>
                  <Switch checked={!!settings.auto?.[k]} onCheckedChange={(v) => setAuto(k, v)} />
                </div>
              ))}
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ الإعدادات</Button>
                <Button variant="outline" onClick={() => autoMutation.mutate()} disabled={autoMutation.isPending}>
                  <Clock className="ml-2 h-4 w-4" />
                  تشغيل التلقائي الآن
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card>
            <CardHeader><CardTitle>إشعارات الانتهاء</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>قبل الانتهاء بالأيام، افصل بينها بمسافة أو فارزة</Label>
                <Input value={(settings.expiry?.beforeDays || []).join(', ')} onChange={(e) => setSettings((s: any) => ({ ...s, expiry: { ...s.expiry, beforeDays: parseNums(e.target.value) } }))} />
              </div>
              <div className="grid gap-2">
                <Label>بعد الانتهاء بالأيام</Label>
                <Input value={(settings.expiry?.afterDays || []).join(', ')} onChange={(e) => setSettings((s: any) => ({ ...s, expiry: { ...s.expiry, afterDays: parseNums(e.target.value) } }))} />
              </div>
              <Button onClick={() => saveMutation.mutate()}>حفظ إعدادات الانتهاء</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> إشعارات الديون</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <Label>تفعيل إشعارات الديون</Label>
                <Switch checked={!!settings.debt?.enabled} onCheckedChange={(v) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, enabled: v } }))} />
              </div>
              <div className="grid gap-2">
                <Label>أقل مبلغ دين للإشعار</Label>
                <Input type="number" value={settings.debt?.minAmount || 0} onChange={(e) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, minAmount: Number(e.target.value) } }))} />
              </div>
              <div className="grid gap-2">
                <Label>تكرار التذكير كل / يوم</Label>
                <Input type="number" value={settings.debt?.repeatDays || 7} onChange={(e) => setSettings((s: any) => ({ ...s, debt: { ...s.debt, repeatDays: Number(e.target.value) } }))} />
              </div>
              <Button onClick={() => saveMutation.mutate()}>حفظ إعدادات الديون</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>سجل الإشعارات</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {pushLogs.isLoading ? <Loader /> : (pushLogs.data || []).map((x: any) => (
                <div key={x.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">{x.title}</div>
                    <Badge variant={x.status === 'sent' ? 'default' : 'destructive'}>
                      {x.status === 'sent' ? 'وصل' : 'فشل'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{x.message}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>الهاتف: {x.phone || '—'}</span>
                    <span>النوع: {x.targetType}</span>
                    <span>{new Date(x.createdAt).toLocaleString('ar-IQ')}</span>
                  </div>
                  {x.error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">{x.error}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> قوالب الإشعارات</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {Object.entries(settings.templates || {}).map(([k, v]: any) => (
                <div key={k} className="grid gap-2">
                  <Label>{k}</Label>
                  <Textarea rows={3} value={v} onChange={(e) => setTemplate(k, e.target.value)} />
                </div>
              ))}
              <div className="md:col-span-2">
                <Button onClick={() => saveMutation.mutate()}>حفظ القوالب</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
