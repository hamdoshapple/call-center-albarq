import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Send, Paperclip, Search, AtSign, UserSearch } from 'lucide-react';
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

function TicketDetails({ selected, details, updateMutation, reply, setReply, setReplyFile, replyMutation }: any) {
  if (!selected) {
    return <EmptyState icon={MessageSquare} title="اختر تكت" description="اختر تكت من القائمة حتى تظهر التفاصيل والردود." />;
  }

  if (details.isLoading) return <Loader />;

  if (!details.data?.ticket) {
    return <EmptyState icon={MessageSquare} title="تعذر فتح التكت" description="حدث خطأ أثناء قراءة تفاصيل التكت." />;
  }

  const ticket = details.data.ticket;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">#{ticket.ticketNo || ticket.id?.replace('legacy_', '').slice(0, 6)}</Badge>
          <Badge>{statusMap[ticket.status] || ticket.status}</Badge>
          <Badge variant="secondary">{ticket.departmentName || 'بدون قسم'}</Badge>
          <Badge variant={ticket.priority === 'urgent' ? 'destructive' : 'outline'}>
            {priorityMap[ticket.priority] || ticket.priority}
          </Badge>
        </div>

        <h2 className="text-xl font-bold">{ticket.subject}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description || 'لا يوجد وصف'}</p>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <div>المشترك: <b>{ticket.externalName || '—'}</b></div>
          <div>الهاتف: <b>{ticket.externalPhone || '—'}</b></div>
          <div>PPPoE: <b>{ticket.externalPppoe || '—'}</b></div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {['new','open','in_progress','pending','resolved','closed'].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={ticket.status === s ? 'default' : 'outline'}
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
  );
}

export default function AdminTicketsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [subscriberQ, setSubscriberQ] = useState('');
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
    externalId: '',
    subscriberId: '',
  });

  const departments = useQuery({
    queryKey: ['ticketDepartments'],
    queryFn: adminTicketsApi.departments,
  });

  const subscriberSearch = useQuery({
    queryKey: ['ticketSubscriberSearch', subscriberQ],
    queryFn: () => adminTicketsApi.searchSubscribers(subscriberQ),
    enabled: createOpen && subscriberQ.trim().length >= 2,
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
      setForm({ subject: '', description: '', category: 'general', priority: 'medium', externalName: '', externalPhone: '', externalPppoe: '', externalId: '', subscriberId: '' });
      setSubscriberQ('');
      setCreateOpen(false);
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

  function chooseTicket(t: any) {
    setSelected(t);

    // Desktop: التفاصيل تظهر يم القائمة، بدون Dialog حتى ما تبقى الشاشة مغوشة
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setDetailOpen(true);
    } else {
      setDetailOpen(false);
    }

    // تنظيف أي overlay عالق
    setTimeout(() => {
      if (typeof document !== 'undefined' && window.innerWidth >= 1024) {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
        document.querySelectorAll('[data-radix-dialog-overlay]').forEach((el) => el.remove());
      }
    }, 50);
  }

  function chooseSubscriber(s: any) {
    setForm((f: any) => ({
      ...f,
      externalName: s.name || '',
      externalPhone: s.phone || '',
      externalPppoe: s.pppoeUsername || '',
      externalId: s.externalId || '',
      subscriberId: s.subscriberId || '',
    }));
    setSubscriberQ(`${s.name || ''} ${s.phone || ''}`.trim());
  }

  const detailsProps = { selected, details, updateMutation, reply, setReply, replyFile, setReplyFile, replyMutation };

  return (
    <div className="space-y-6">
      <PageHeader title="مركز التكتات" />

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

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              التكتات

              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="ml-2 h-4 w-4" /> جديد</Button>
                </DialogTrigger>

                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>إنشاء تكت إداري</DialogTitle></DialogHeader>

                  <div className="grid gap-3">
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <Label className="mb-2 block">اختيار مشترك</Label>
                      <div className="relative">
                        <UserSearch className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pr-9"
                          placeholder="ابحث بالاسم أو الهاتف أو PPPoE"
                          value={subscriberQ}
                          onChange={(e) => setSubscriberQ(e.target.value)}
                        />
                      </div>

                      {subscriberQ.trim().length >= 2 && (
                        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                          {subscriberSearch.isLoading ? <Loader /> : (subscriberSearch.data || []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">لا توجد نتائج.</div>
                          ) : (subscriberSearch.data || []).map((s: any) => (
                            <button
                              key={`${s.source}-${s.externalId || s.subscriberId || s.phone}`}
                              type="button"
                              onClick={() => chooseSubscriber(s)}
                              className={`w-full rounded-xl border p-3 text-right hover:bg-muted ${form.externalPhone === s.phone && form.externalPppoe === s.pppoeUsername ? 'border-primary bg-primary/5' : ''}`}
                            >
                              <div className="font-semibold">{s.name || 'بدون اسم'}</div>
                              <div className="text-sm text-muted-foreground">{s.phone || '—'} • {s.pppoeUsername || '—'}</div>
                              <div className="mt-1 flex gap-2">
                                <Badge variant="outline">{s.source}</Badge>
                                <Badge variant="secondary">{s.packageName || '—'}</Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input placeholder="اسم المشترك" value={form.externalName} onChange={(e) => setForm({ ...form, externalName: e.target.value })} />
                      <Input placeholder="الهاتف" value={form.externalPhone} onChange={(e) => setForm({ ...form, externalPhone: e.target.value })} />
                      <Input placeholder="PPPoE" value={form.externalPppoe} onChange={(e) => setForm({ ...form, externalPppoe: e.target.value })} />
                    </div>

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

                    <Button disabled={createMutation.isPending || !form.subject.trim()} onClick={() => createMutation.mutate()}>
                      {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء التكت'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>

          <CardContent className="max-h-[calc(100vh-180px)] space-y-3 overflow-y-auto">
            {tickets.isLoading ? <Loader /> : list.length === 0 ? (
              <EmptyState icon={MessageSquare} title="لا توجد تكتات" description="لا توجد تكتات مطابقة للفلاتر الحالية." />
            ) : list.map((t: any) => (
              <button
                key={t.id}
                onClick={() => chooseTicket(t)}
                className={`w-full rounded-xl border p-3 text-right transition hover:bg-muted/40 ${selected?.id === t.id ? 'border-primary bg-muted/40' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="outline">#{t.ticketNo || t.id?.replace('legacy_', '').slice(0, 6)}</Badge>
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

        <Card className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
          <CardHeader><CardTitle>تفاصيل التكت</CardTitle></CardHeader>
          <CardContent><TicketDetails {...detailsProps} /></CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto lg:hidden">
          <DialogHeader><DialogTitle>تفاصيل التكت</DialogTitle></DialogHeader>
          <TicketDetails {...detailsProps} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
