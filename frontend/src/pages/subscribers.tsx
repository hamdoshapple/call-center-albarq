import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserSearch,
  Search,
  Phone,
  Wifi,
  Calendar,
  Wallet,
  MapPin,
  Ticket as TicketIcon,
  User,
  ArrowLeft,
  Plus,
  Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { subscribersApi } from '@/api';
import type { Subscriber, SubscriberStatus } from '@/types';
import { useLanguage } from '@/hooks/use-language';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

const emptyForm: Omit<Subscriber, 'id'> = {
  name: '',
  phone: '',
  pppoeUsername: '',
  status: 'active',
  package: '',
  speed: '',
  expiration: new Date().toISOString().slice(0, 10),
  debt: 0,
  lastActivation: new Date().toISOString(),
  address: '',
  notes: '',
};

export function SubscribersPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscriber | null>(null);
  const [form, setForm] = useState<Omit<Subscriber, 'id'>>(emptyForm);

  const { data: results, isLoading } = useQuery({
    queryKey: ['subscribers', query],
    queryFn: () => subscribersApi.searchSubscribers(query),
  });

  const { data: selected } = useQuery({
    queryKey: ['subscriber', id],
    queryFn: () => subscribersApi.getSubscriber(id!),
    enabled: !!id,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['subscriber-tickets', id],
    queryFn: () => subscribersApi.getSubscriberTickets(id!),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['subscribers'] });
    qc.invalidateQueries({ queryKey: ['subscriber'] });
  };

  const createMutation = useMutation({
    mutationFn: subscribersApi.createSubscriber,
    onSuccess: () => {
      toast({ title: 'تمت إضافة المشترك بنجاح' });
      setFormOpen(false);
      refresh();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Subscriber> }) =>
      subscribersApi.updateSubscriber(id, data),
    onSuccess: () => {
      toast({ title: 'تم تعديل بيانات المشترك بنجاح' });
      setFormOpen(false);
      refresh();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (s: Subscriber) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone,
      pppoeUsername: s.pppoeUsername,
      status: s.status,
      package: s.package,
      speed: s.speed,
      expiration: s.expiration ? s.expiration.slice(0, 10) : new Date().toISOString().slice(0, 10),
      debt: Number(s.debt || 0),
      lastActivation: s.lastActivation || new Date().toISOString(),
      address: s.address,
      notes: s.notes || '',
    });
    setFormOpen(true);
  };

  const submit = () => {
    const payload = {
      ...form,
      debt: Number(form.debt || 0),
      expiration: form.expiration ? new Date(form.expiration).toISOString() : new Date().toISOString(),
    };

    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  if (id) {
    if (!selected) return <Loader />;
    return (
      <>
        <SubscriberProfile subscriber={selected} tickets={tickets} onBack={() => navigate('/subscribers')} onEdit={() => openEdit(selected)} />
        <SubscriberFormDialog open={formOpen} onOpenChange={setFormOpen} form={form} setForm={setForm} editing={editing} onSubmit={submit} loading={createMutation.isPending || updateMutation.isPending} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('subscribers.title')}
        subtitle={t('subscribers.subtitle')}
        icon={<UserSearch className="h-5 w-5" />}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            إضافة مشترك
          </Button>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t('subscribers.search_placeholder')} className="h-12 ps-10 text-base" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader />
      ) : (results ?? []).length === 0 ? (
        <Card><CardContent><EmptyState icon={UserSearch} title={t('common.no_results')} description={t('subscribers.search_placeholder')} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(results ?? []).map((s) => (
            <Card key={s.id} className="transition hover:border-primary hover:shadow-md">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex cursor-pointer items-center gap-3" onClick={() => navigate(`/subscribers/${s.id}`)}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></div>
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{s.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={s.status} />
                    <Button size="icon-sm" variant="ghost" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Badge variant="secondary">{s.package}</Badge>
                  {s.debt > 0 && <span className="text-destructive font-medium">{formatCurrency(s.debt, 'ar')}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SubscriberFormDialog open={formOpen} onOpenChange={setFormOpen} form={form} setForm={setForm} editing={editing} onSubmit={submit} loading={createMutation.isPending || updateMutation.isPending} />
    </div>
  );
}

function SubscriberProfile({ subscriber: s, tickets, onBack, onEdit }: { subscriber: Subscriber; tickets: any[]; onBack: () => void; onEdit: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const rows = [
    { icon: Phone, label: t('common.phone'), value: s.phone },
    { icon: Wifi, label: t('subscribers.pppoe'), value: s.pppoeUsername },
    { icon: Wifi, label: t('subscribers.package'), value: `${s.package} • ${s.speed}` },
    { icon: Calendar, label: t('subscribers.expiration'), value: formatDate(s.expiration, lang) },
    { icon: Calendar, label: t('subscribers.last_activation'), value: formatDate(s.lastActivation, lang) },
    { icon: Wallet, label: t('subscribers.debt'), value: formatCurrency(s.debt, lang) },
    { icon: MapPin, label: t('subscribers.address'), value: s.address },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
          <PageHeader title={s.name} subtitle={t('subscribers.profile')} icon={<User className="h-5 w-5" />} />
        </div>
        <Button onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          تعديل
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('subscribers.profile')}</CardTitle>
            <StatusBadge status={s.status} />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><r.icon className="h-4 w-4" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="font-medium">{r.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {s.notes && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">{s.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="h-4 w-4" />
              التذاكر
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {tickets.length}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
            ) : (
              tickets.map((ticket) => {
                const details = ticket.notes?.[0]?.body;
                return (
                  <div key={ticket.id} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="whitespace-pre-wrap text-sm font-medium">{ticket.subject}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('ar-IQ') : '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={ticket.status} />
                        <Badge variant={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'destructive' : 'secondary'}>
                          {ticket.priority === 'urgent' ? 'عاجلة' :
                           ticket.priority === 'high' ? 'عالية' :
                           ticket.priority === 'low' ? 'منخفضة' : 'متوسطة'}
                        </Badge>
                      </div>
                    </div>

                    {details && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">تفاصيل الاتصال</p>
                        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-foreground">
                          {details}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SubscriberFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editing,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: Omit<Subscriber, 'id'>;
  setForm: (v: Omit<Subscriber, 'id'>) => void;
  editing: Subscriber | null;
  onSubmit: () => void;
  loading: boolean;
}) {
  const set = (key: keyof Omit<Subscriber, 'id'>, value: any) => setForm({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'تعديل مشترك' : 'إضافة مشترك جديد'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <Field label="الهاتف">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>

          <Field label="يوزر PPPoE">
            <Input value={form.pppoeUsername} onChange={(e) => set('pppoeUsername', e.target.value)} />
          </Field>

          <Field label="الحالة">
            <Select value={form.status} onValueChange={(v) => set('status', v as SubscriberStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="expired">منتهي</SelectItem>
                <SelectItem value="suspended">معلق</SelectItem>
                <SelectItem value="disabled">معطل</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="الباقة">
            <Input value={form.package} onChange={(e) => set('package', e.target.value)} placeholder="مثلاً 40 Mbps" />
          </Field>

          <Field label="السرعة">
            <Input value={form.speed} onChange={(e) => set('speed', e.target.value)} placeholder="مثلاً 20 Mbps" />
          </Field>

          <Field label="تاريخ الانتهاء">
            <Input type="date" value={form.expiration?.slice(0, 10)} onChange={(e) => set('expiration', e.target.value)} />
          </Field>

          <Field label="الدين">
            <Input type="number" value={form.debt} onChange={(e) => set('debt', Number(e.target.value || 0))} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="العنوان">
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="ملاحظات">
              <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={loading || !form.name || !form.phone} onClick={onSubmit}>
            {loading ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
