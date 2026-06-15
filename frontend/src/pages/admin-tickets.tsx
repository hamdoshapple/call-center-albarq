import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Send, Paperclip, Search, AtSign } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { adminTicketsApi } from '@/api/adminTickets';
import { useToast } from '@/components/ui/use-toast';

const statusMap: any = {
  new: 'جديد',
  open: 'مفتوح',
  pending: 'بانتظار',
  in_progress: 'قيد المعالجة',
  resolved: 'محلول',
  closed: 'مغلق',
};

const priorityMap: any = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالي',
  urgent: 'طارئ',
};

const categories = [
  ['technical', 'ضعف / مشكلة خدمة'],
  ['accounts', 'مالي / حسابات'],
  ['sales', 'اشتراك / ترقية'],
  ['maintenance', 'صيانة / زيارة'],
  ['complaint', 'شكوى'],
  ['general', 'عام'],
];

export default function AdminTicketsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const [form, setForm] = useState<any>({
    subject: '',
    description: '',
    category: 'general',
    priority: 'medium',
    externalName: '',
    externalPhone: '',
    externalPppoe: '',
  });

  const departments = useQuery({
    queryKey: ['ticketDepartments'],
    queryFn: adminTicketsApi.departments,
  });

  const tickets = useQuery({
    queryKey: ['adminTickets', q, status, departmentId],
    queryFn: () => adminTicketsApi.list({ q, status, departmentId }),
  });

  const details = useQuery({
    queryKey: ['adminTicket', selected?.id],
    queryFn: () => adminTicketsApi.get(selected.id),
    enabled: !!selected?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => adminTicketsApi.create(form),
    onSuccess: () => {
      setForm({ subject: '', description: '', category: 'general', priority: 'medium', externalName: '', externalPhone: '', externalPppoe: '' });
      qc.invalidateQueries({ queryKey: ['adminTickets'] });
      toast({ title: 'تم إنشاء التكت' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => adminTicketsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTickets'] });
      qc.invalidateQueries({ queryKey: ['adminTicket'] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      let attachmentUrl = '';
      let fileName = '';
      let mimeType = '';

      if (replyFile) {
        const up = await adminTicketsApi.upload(replyFile);
        attachmentUrl = up.url || up.path || up.fileUrl || '';
        fileName = replyFile.name;
        mimeType = replyFile.type;
      }

      return adminTicketsApi.reply(selected.id, {
        body: reply,
        visibility: 'public',
        attachmentUrl,
        fileName,
        mimeType,
      });
    },
    onSuccess: () => {
      setReply('');
      setReplyFile(null);
      qc.invalidateQueries({ queryKey: ['adminTicket', selected?.id] });
      qc.invalidateQueries({ queryKey: ['adminTickets'] });
      toast({ title: 'تم إرسال الرد' });
    },
  });

  const list = useMemo(() => tickets.data || [], [tickets.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز التكتات"
        description="إدارة تكتات المشتركين، توزيعها على الأقسام، الردود، المرفقات، والمنشن."
        icon={<MessageSquare className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث بالاسم، الهاتف، PPPoE أو رقم التكت" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(statusMap).map(([k, v]: any) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={departmentId || 'all'} onValueChange={(v) => setDepartmentId(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {(departments.data || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              التكتات
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="ml-2 h-4 w-4" /> جديد</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader><DialogTitle>إنشاء تكت إداري</DialogTitle></DialogHeader>

                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>عنوان التكت</Label>
                      <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                    </div>

                    <div className="grid gap-2">
                      <Label>الوصف</Label>
                      <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>التصنيف</Label>
                        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label>الأولوية</Label>
                        <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(priorityMap).map(([k, v]: any) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input placeholder="اسم المشترك" value={form.externalName} onChange={(e) => setForm({ ...form, externalName: e.target.value })} />
                      <Input placeholder="الهاتف" value={form.externalPhone} onChange={(e) => setForm({ ...form, externalPhone: e.target.value })} />
                      <Input placeholder="PPPoE" value={form.externalPppoe} onChange={(e) => setForm({ ...form, externalPppoe: e.target.value })} />
                    </div>

                    <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                      {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء التكت'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {tickets.isLoading ? <Loader /> : list.length === 0 ? (
              <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="لا توجد تكتات" description="كلشي هادئ... الهدوء قبل أول اتصال 😄" />
            ) : list.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full rounded-xl border p-3 text-right transition hover:bg-muted/40 ${selected?.id === t.id ? 'border-primary bg-muted/40' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="outline">#{t.ticketNo}</Badge>
                  <Badge>{statusMap[t.status] || t.status}</Badge>
                </div>

                <div className="font-semibold">{t.subject}</div>
                <div className="text-sm text-muted-foreground">{t.externalName || '—'} • {t.externalPhone || '—'}</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">{t.departmentName || 'بدون قسم'}</Badge>
                  <Badge variant={t.priority === 'urgent' ? 'destructive' : 'outline'}>{priorityMap[t.priority] || t.priority}</Badge>
                  {Number(t.repliesCount) > 0 && <Badge variant="outline">{t.repliesCount} رد</Badge>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تفاصيل التكت</CardTitle>
          </CardHeader>

          <CardContent>
            {!selected ? (
              <EmptyState icon={<MessageSquare className="h-10 w-10" />} title="اختر تكت" description="اختر تكت من القائمة حتى تظهر التفاصيل والردود." />
            ) : details.isLoading ? <Loader /> : (
              <div className="space-y-5">
                <div className="rounded-xl border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">#{details.data.ticket.ticketNo}</Badge>
                    <Badge>{statusMap[details.data.ticket.status] || details.data.ticket.status}</Badge>
                    <Badge variant="secondary">{details.data.ticket.departmentName || 'بدون قسم'}</Badge>
                    <Badge variant={details.data.ticket.priority === 'urgent' ? 'destructive' : 'outline'}>
                      {priorityMap[details.data.ticket.priority] || details.data.ticket.priority}
                    </Badge>
                  </div>

                  <h2 className="text-xl font-bold">{details.data.ticket.subject}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{details.data.ticket.description || 'لا يوجد وصف'}</p>

                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
                    <div>المشترك: <b>{details.data.ticket.externalName || '—'}</b></div>
                    <div>الهاتف: <b>{details.data.ticket.externalPhone || '—'}</b></div>
                    <div>PPPoE: <b>{details.data.ticket.externalPppoe || '—'}</b></div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {['new','open','in_progress','pending','resolved','closed'].map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={details.data.ticket.status === s ? 'default' : 'outline'}
                        onClick={() => updateMutation.mutate({ id: selected.id, data: { status: s } })}
                      >
                        {statusMap[s]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {(details.data.replies || []).map((r: any) => (
                    <div key={r.id} className="rounded-xl border bg-muted/20 p-3">
                      <div className="mb-1 text-sm font-semibold">{r.authorName || 'النظام'}</div>
                      <div className="whitespace-pre-wrap">{r.body}</div>
                      <div className="mt-2 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('ar-IQ')}</div>
                    </div>
                  ))}
                </div>

                {(details.data.attachments || []).length > 0 && (
                  <div className="rounded-xl border p-3">
                    <div className="mb-2 font-semibold">المرفقات</div>
                    <div className="flex flex-wrap gap-2">
                      {details.data.attachments.map((a: any) => (
                        <a key={a.id} href={a.url} target="_blank" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                          <Paperclip className="ml-1 inline h-4 w-4" />
                          {a.fileName || 'مرفق'}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <AtSign className="h-4 w-4" />
                    للمنشن اكتب @username داخل الرد
                  </div>

                  <Textarea
                    rows={4}
                    placeholder="اكتب رد... مثال: @ahmed راجع هذا الخط"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Input type="file" accept="image/*" className="max-w-xs" onChange={(e) => setReplyFile(e.target.files?.[0] || null)} />
                    <Button disabled={replyMutation.isPending || !reply.trim()} onClick={() => replyMutation.mutate()}>
                      <Send className="ml-2 h-4 w-4" />
                      {replyMutation.isPending ? 'جاري الإرسال...' : 'إرسال رد'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
