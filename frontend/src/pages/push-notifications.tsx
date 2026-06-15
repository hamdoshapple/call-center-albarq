import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Send, Users, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { pushNotificationsApi } from '@/api/pushNotifications';

const targetLabels: any = {
  all: 'إرسال عام',
  phone: 'مشتركين محددين',
  debt: 'المشتركين عليهم ديون',
  expire_days: 'قرب الانتهاء',
  expired: 'المنتهين',
};

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

  const stats = useQuery({
    queryKey: ['pushStats'],
    queryFn: pushNotificationsApi.stats,
  });

  const sendMutation = useMutation({
    mutationFn: () => pushNotificationsApi.send(form),
    onSuccess: (data) => {
      toast({ title: `تم الإرسال`, description: `وصل: ${data.sent} / فشل: ${data.failed}` });
      setForm((f) => ({ ...f, message: '' }));
      qc.invalidateQueries({ queryKey: ['pushStats'] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة الإشعارات" />

      {stats.isLoading ? <Loader /> : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Smartphone className="h-8 w-8 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">الأجهزة الفعالة</div>
                <div className="text-3xl font-bold">{Number(stats.data?.stats?.activeDevices || 0)}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">المشتركين المسجلين</div>
                <div className="text-3xl font-bold">{Number(stats.data?.stats?.subscribers || 0)}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <BellRing className="h-8 w-8 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">كل الأجهزة</div>
                <div className="text-3xl font-bold">{Number(stats.data?.stats?.totalDevices || 0)}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>إرسال إشعار Push</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>العنوان</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid gap-2">
              <Label>نص الإشعار</Label>
              <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>الفئة المستهدفة</Label>
                <Select value={form.targetType} onValueChange={(v) => setForm({ ...form, targetType: v, targetValue: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">إرسال عام</SelectItem>
                    <SelectItem value="phone">مشتركين محددين</SelectItem>
                    <SelectItem value="debt">ديون</SelectItem>
                    <SelectItem value="expire_days">قبل الانتهاء</SelectItem>
                    <SelectItem value="expired">منتهين</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>
                  {form.targetType === 'phone' ? 'الأرقام، رقم بكل سطر أو مفصول بفارزة' :
                   form.targetType === 'debt' ? 'أقل مبلغ دين' :
                   form.targetType === 'expire_days' ? 'ينتهي خلال عدد أيام' : 'قيمة إضافية'}
                </Label>
                <Input
                  disabled={form.targetType === 'all' || form.targetType === 'expired'}
                  placeholder={form.targetType === 'phone' ? '078xxxxxxx' : form.targetType === 'debt' ? '1000' : form.targetType === 'expire_days' ? '3' : ''}
                  value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>الرابط عند الضغط</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>

            <Button disabled={sendMutation.isPending || !form.title.trim() || !form.message.trim()} onClick={() => sendMutation.mutate()}>
              <Send className="ml-2 h-4 w-4" />
              {sendMutation.isPending ? 'جاري الإرسال...' : 'إرسال الإشعار'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>آخر الإرسالات</CardTitle>
          </CardHeader>
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
    </div>
  );
}
