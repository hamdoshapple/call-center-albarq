import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, FileText, Network, Plus, Power, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { vpnApi } from '@/api';
import type { VpnUser } from '@/api/vpn';

const emptyForm: Partial<VpnUser> = {
  username: '',
  password: '',
  service: 'l2tp',
  remote_ip: '*',
  local_ip: '',
  routed_ranges: '',
  notes: '',
  enabled: true,
};

export function VpnPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState<Partial<VpnUser>>(emptyForm);
  const [editing, setEditing] = useState<VpnUser | null>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

  const usersQ = useQuery({
    queryKey: ['vpn', q],
    queryFn: () => vpnApi.list({ q }),
    refetchInterval: 15000,
  });

  const statusQ = useQuery({
    queryKey: ['vpn-status'],
    queryFn: vpnApi.status,
    refetchInterval: 15000,
  });

  const save = useMutation({
    mutationFn: () => (editing ? vpnApi.update(editing.id, form) : vpnApi.create(form)),
    onSuccess: () => {
      toast({ title: 'تم الحفظ', description: 'تم تحديث مستخدمي VPN' });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ['vpn'] });
      void qc.invalidateQueries({ queryKey: ['vpn-status'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (id: string) => vpnApi.toggle(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vpn'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => vpnApi.remove(id),
    onSuccess: () => {
      toast({ title: 'تم الحذف' });
      void qc.invalidateQueries({ queryKey: ['vpn'] });
    },
  });

  const extend = useMutation({
    mutationFn: (id: string) => vpnApi.extend(id, 1),
    onSuccess: () => {
      toast({ title: 'تم التمديد شهر' });
      void qc.invalidateQueries({ queryKey: ['vpn'] });
    },
  });

  const generate = useMutation({
    mutationFn: vpnApi.generateChap,
    onSuccess: (r: { users: number }) => toast({ title: `تم توليد chap-secrets`, description: `${r.users} مستخدم` }),
  });

  const restart = useMutation({
    mutationFn: vpnApi.restartService,
    onSuccess: () => {
      toast({ title: 'تمت إعادة تشغيل خدمة VPN' });
      void qc.invalidateQueries({ queryKey: ['vpn'] });
      void qc.invalidateQueries({ queryKey: ['vpn-status'] });
    },
    onError: () => toast({ title: 'فشل إعادة تشغيل خدمة VPN', variant: 'destructive' }),
  });

  const applyRoutes = useMutation({
    mutationFn: (id: string) => vpnApi.applyRoutes(id),
    onSuccess: (r: { routes?: string[]; gateway: string; dev: string }) => {
      toast({ title: `تم تطبيق ${r.routes?.length ?? 0} Route`, description: `${r.gateway} عبر ${r.dev}` });
      void qc.invalidateQueries({ queryKey: ['vpn-status'] });
    },
    onError: () => toast({ title: 'فشل تطبيق Routes', variant: 'destructive' }),
  });

  const users = usersQ.data ?? [];

  useEffect(() => {
    document.documentElement.dir = 'rtl';
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة VPN"
        subtitle="إدارة مستخدمي L2TP، توليد chap-secrets، عرض المتصلين، وتطبيق Routes"
        icon={<Network className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={() => restart.mutate()} disabled={restart.isPending}>
              <RotateCcw className="h-4 w-4" />
              إعادة تشغيل الخدمة
            </Button>
            <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <FileText className="h-4 w-4" />
              توليد chap-secrets
            </Button>
            <Button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}>
              <Plus className="h-4 w-4" />
              إضافة VPN
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">حالة PPP / Routes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <pre className="max-h-56 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">{statusQ.data?.ip || 'لا توجد جلسات PPP حالياً'}</pre>
          <pre className="max-h-56 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">{statusQ.data?.routes || 'لا توجد Routes خاصة بالـ VPN'}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>مستخدمين VPN</span>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="h-9 w-48" />
              <Button variant="ghost" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: ['vpn'] })}>
                <RefreshCw className="h-4 w-4" />
                تحديث
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersQ.isLoading ? (
            <Loader />
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد مستخدمين VPN</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-right">الحالة</th>
                    <th className="py-2 text-right">المستخدم</th>
                    <th className="py-2 text-right">كلمة المرور</th>
                    <th className="py-2 text-right">الخدمة</th>
                    <th className="py-2 text-right">Remote IP</th>
                    <th className="py-2 text-right">Local IP</th>
                    <th className="py-2 text-right">Ranges</th>
                    <th className="py-2 text-right">التفعيل</th>
                    <th className="py-2 text-right">الانتهاء</th>
                    <th className="py-2 text-right">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((r: VpnUser) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${r.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <Badge variant={r.online ? 'default' : 'secondary'}>{r.online ? 'متصل' : 'غير متصل'}</Badge>
                        </div>
                      </td>
                      <td className="py-2 font-semibold">{r.username}</td>
                      <td className="py-2"><code className="text-xs">{showPass ? r.password : '••••••••'}</code></td>
                      <td className="py-2 uppercase">{r.service}</td>
                      <td className="py-2">{r.remote_ip || '—'}</td>
                      <td className="py-2">{r.local_ip || '—'}</td>
                      <td className="max-w-[220px] truncate py-2">{r.routed_ranges || '—'}</td>
                      <td className="py-2"><Badge variant={r.enabled ? 'default' : 'destructive'}>{r.enabled ? 'مفعل' : 'متوقف'}</Badge></td>
                      <td className="py-2">{r.expires_at ? new Date(r.expires_at).toLocaleString() : '—'}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => { setEditing(r); setForm(r); setOpen(true); }}>تعديل</Button>
                          <Button size="icon" variant="ghost" onClick={() => toggle.mutate(r.id)}><Power className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => extend.mutate(r.id)}><Clock className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => applyRoutes.mutate(r.id)}><Network className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="link" className="mt-2 px-0" onClick={() => setShowPass((x) => !x)}>
                {showPass ? 'إخفاء كلمات المرور' : 'كشف كلمات المرور'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل VPN' : 'إضافة VPN'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <F label="اسم المستخدم">
              <Input value={form.username ?? ''} onChange={(e) => setForm((x) => ({ ...x, username: e.target.value }))} />
            </F>
            <F label="كلمة المرور">
              <Input value={form.password ?? ''} onChange={(e) => setForm((x) => ({ ...x, password: e.target.value }))} />
            </F>
            <F label="الخدمة">
              <Select value={form.service ?? 'l2tp'} onValueChange={(v) => setForm((x) => ({ ...x, service: v as VpnUser['service'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="l2tp">L2TP</SelectItem>
                  <SelectItem value="pptp">PPTP</SelectItem>
                  <SelectItem value="sstp">SSTP</SelectItem>
                  <SelectItem value="wireguard">WireGuard</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Remote IP">
              <Input value={form.remote_ip ?? ''} onChange={(e) => setForm((x) => ({ ...x, remote_ip: e.target.value }))} placeholder="* أو 10.50.50.10" />
            </F>
            <F label="Local IP">
              <Input value={form.local_ip ?? ''} onChange={(e) => setForm((x) => ({ ...x, local_ip: e.target.value }))} placeholder="اختياري" />
            </F>
            <F label="تاريخ الانتهاء">
              <Input type="datetime-local" onChange={(e) => setForm((x) => ({ ...x, expires_at: e.target.value }))} />
            </F>
            <F label="IP Ranges خلف الراوتر">
              <Input value={form.routed_ranges ?? ''} onChange={(e) => setForm((x) => ({ ...x, routed_ranges: e.target.value }))} placeholder="192.168.0.0/24" />
            </F>
            <F label="ملاحظات">
              <Input value={form.notes ?? ''} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} />
            </F>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
