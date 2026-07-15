import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  ListChecks,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Tag,
  Ticket,
  Timer,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { adminTicketsApi } from '@/api/adminTickets';

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

async function staffFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('cc_token') || localStorage.getItem('token') || '';
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'REQUEST_FAILED');
  return data;
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m} د ${r} ث`;
  const h = Math.floor(m / 60);
  return `${h} س ${m % 60} د`;
}

export default function EmployeeTicketsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'work' | 'urgent' | 'closed'>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const tickets = useQuery({
    queryKey: ['employeeTickets', q],
    queryFn: () => adminTicketsApi.list({ q }),
    refetchInterval: 12000,
  });

  const summary = useQuery({
    queryKey: ['ticketProSummary'],
    queryFn: () => staffFetch('/api/admin-tickets-pro/summary'),
    refetchInterval: 12000,
  });

  const details = useQuery({
    queryKey: ['employeeTicket', selected?.id],
    queryFn: () => adminTicketsApi.get(selected.id),
    enabled: !!selected?.id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => adminTicketsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employeeTickets'] });
      qc.invalidateQueries({ queryKey: ['employeeTicket'] });
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
      qc.invalidateQueries({ queryKey: ['employeeTicket', selected?.id] });
      qc.invalidateQueries({ queryKey: ['employeeTickets'] });
    },
  });

  async function openTicket(id: string) {
    if (!id) return;
    try {
      const data = await adminTicketsApi.get(id);
      if (data?.ticket) {
        setSelected(data.ticket);
        window.history.replaceState({}, '', '/employee/tickets');
      }
    } catch {}
  }

  useEffect(() => {
    const run = () => {
      const id = new URLSearchParams(window.location.search).get('ticket') || '';
      if (id) openTicket(id);
    };

    run();

    const onMsg = (event: MessageEvent) => {
      const id = event.data?.payload?.ticketId || event.data?.ticketId || '';
      if (event.data?.type === 'FORCE_NAVIGATE' && event.data?.url) {
        window.location.href = event.data.url;
        return;
      }
      if (event.data?.type === 'TICKET_OPEN_FROM_PUSH' && id) openTicket(String(id));
    };

    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    window.addEventListener('focus', run);

    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onMsg);
      window.removeEventListener('focus', run);
    };
  }, [tickets.data]);

  const rows = Array.isArray(tickets.data) ? tickets.data : [];

  const list = useMemo(() => {
    return rows.filter((t: any) => {
      if (filter === 'open') return ['new', 'open', 'pending'].includes(t.status);
      if (filter === 'work') return t.status === 'in_progress';
      if (filter === 'urgent') return t.priority === 'urgent' || t.priority === 'high';
      if (filter === 'closed') return ['resolved', 'closed'].includes(t.status);
      return true;
    });
  }, [rows, filter]);

  const openCount = rows.filter((x: any) => ['new', 'open', 'pending'].includes(x.status)).length;
  const workCount = rows.filter((x: any) => x.status === 'in_progress').length;
  const doneCount = rows.filter((x: any) => ['resolved', 'closed'].includes(x.status)).length;

  return (
    <section dir="rtl" className="flex h-screen flex-col overflow-hidden bg-[#f6f8fb] px-4 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex shrink-0 items-center justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-500">Tickets Center</p>
          <h1 className="text-3xl font-black text-slate-950">التذاكر</h1>
          <p className="mt-1 text-xs font-bold text-slate-400">متابعة مشاكل وطلبات العملاء</p>
        </div>

        <button
          onClick={() => tickets.refetch()}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-lg shadow-slate-200"
        >
          <RefreshCw className={`h-5 w-5 ${tickets.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
        <StatusCard title="مفتوحة" value={openCount} icon={<AlertCircle className="h-5 w-5" />} color="red" />
        <StatusCard title="قيد العمل" value={workCount} icon={<Clock3 className="h-5 w-5" />} color="amber" />
        <StatusCard title="مكتملة" value={doneCount} icon={<CheckCircle2 className="h-5 w-5" />} color="green" />
      </div>

      <div className="mt-4 flex shrink-0 items-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tickets.refetch()}
          className="min-w-0 w-full bg-transparent text-sm font-black outline-none placeholder:text-slate-400"
          placeholder="بحث بالتذاكر أو اسم المشترك..."
        />
      </div>

      <div className="mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
        <Chip active={filter === 'all'} label="الكل" onClick={() => setFilter('all')} />
        <Chip active={filter === 'open'} label="مفتوحة" onClick={() => setFilter('open')} />
        <Chip active={filter === 'work'} label="قيد العمل" onClick={() => setFilter('work')} />
        <Chip active={filter === 'urgent'} label="مستعجلة" onClick={() => setFilter('urgent')} />
        <Chip active={filter === 'closed'} label="مغلقة" onClick={() => setFilter('closed')} />
      </div>

      <LiveActivityStrip data={summary.data} />

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {tickets.isLoading ? (
          <div className="rounded-[2rem] bg-white p-8 text-center font-black text-slate-400">جاري تحميل التذاكر...</div>
        ) : list.length ? (
          list.map((t: any) => <TicketCard key={t.id} ticket={t} onOpen={() => setSelected(t)} />)
        ) : (
          <EmptyTickets />
        )}
      </div>

      {selected ? (
        <TicketModal
          selected={selected}
          details={details}
          reply={reply}
          setReply={setReply}
          setReplyFile={setReplyFile}
          replyMutation={replyMutation}
          updateMutation={updateMutation}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}

function StatusCard({ title, value, icon, color }: any) {
  const cls =
    color === 'green' ? 'bg-emerald-50 text-emerald-600' :
    color === 'amber' ? 'bg-amber-50 text-amber-600' :
    'bg-red-50 text-red-500';

  return (
    <div className="rounded-[1.35rem] bg-white p-3 text-center shadow-lg shadow-slate-200/70">
      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-2xl ${cls}`}>{icon}</div>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="text-[11px] font-bold text-slate-400">{title}</p>
    </div>
  );
}

function Chip({ active, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black transition ${
        active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'border border-slate-100 bg-white text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function TicketCard({ ticket, onOpen }: any) {
  const urgent = ticket.priority === 'urgent' || ticket.priority === 'high';

  return (
    <button
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-[1.65rem] border border-slate-100 bg-white p-4 text-right shadow-lg shadow-slate-200/70 active:scale-[0.99]"
    >
      {urgent ? <div className="absolute right-0 top-0 h-full w-1.5 bg-red-500" /> : null}

      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
          <Ticket className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-black text-slate-950">{ticket.subject || 'بدون عنوان'}</h3>
            <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">
              #{ticket.ticketNo || String(ticket.id || '').replace('legacy_', '').slice(0, 6)}
            </span>
          </div>

          <p className="mt-1 truncate text-xs font-bold text-slate-400">
            {ticket.externalName || ticket.externalPhone || ticket.externalPppoe || 'مشترك غير معروف'}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge label={statusMap[ticket.status] || ticket.status || '—'} color="green" />
            <Badge label={priorityMap[ticket.priority] || ticket.priority || '—'} color={urgent ? 'red' : 'amber'} />
            {ticket.departmentName ? <Badge label={ticket.departmentName} color="slate" /> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function Badge({ label, color }: any) {
  const cls =
    color === 'green' ? 'bg-emerald-50 text-emerald-700' :
    color === 'red' ? 'bg-red-50 text-red-600' :
    color === 'amber' ? 'bg-amber-50 text-amber-600' :
    'bg-slate-50 text-slate-500';

  return <span className={`rounded-xl px-2.5 py-1 text-[10px] font-black ${cls}`}>{label}</span>;
}

function EmptyTickets() {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-500">
        <Ticket className="h-8 w-8" />
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">ماكو تذاكر حالياً</h2>
      <p className="mt-2 text-sm font-bold text-slate-400">أنت على اطلاع بجميع المهام.</p>
    </div>
  );
}

function LiveActivityStrip({ data }: any) {
  const items = data?.activities || [];
  if (!items.length) return null;

  return (
    <div className="mt-3 rounded-[1.4rem] bg-white/80 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
        <Activity className="h-4 w-4 text-emerald-500" />
        النشاط المباشر
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {items.slice(0, 6).map((x: any) => (
          <div key={x.id} className="min-w-[190px] rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            {x.userName || 'النظام'}: {x.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketModal({ selected, details, reply, setReply, setReplyFile, replyMutation, updateMutation, onClose }: any) {
  const ticket = details.data?.ticket || selected;
  const replies = details.data?.replies || [];
  const attachments = details.data?.attachments || [];

  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [miniToast, setMiniToast] = useState<any>(null);

  function showMiniToast(title: string, type: 'success' | 'error' = 'success') {
    setMiniToast({ title, type });
    window.setTimeout(() => setMiniToast(null), 2200);
  }

  const users = useQuery({
    queryKey: ['ticketUsers'],
    queryFn: () => staffFetch('/api/admin-tickets/users'),
  });

  const team = useQuery({
    queryKey: ['ticketTeam', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/team`),
    enabled: Boolean(selected?.id),
  });

  const proPresence = useQuery({
    queryKey: ['ticketPresence', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/presence`, {
      method: 'POST',
      body: JSON.stringify({ typing: false }),
    }),
    enabled: Boolean(selected?.id),
    refetchInterval: 10000,
  });

  const proActivity = useQuery({
    queryKey: ['ticketActivity', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/activity`),
    enabled: Boolean(selected?.id),
    refetchInterval: 12000,
  });

  const proChecklist = useQuery({
    queryKey: ['ticketChecklist', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/checklist`),
    enabled: Boolean(selected?.id),
  });

  const proTags = useQuery({
    queryKey: ['ticketTags', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/tags`),
    enabled: Boolean(selected?.id),
  });

  const proTimer = useQuery({
    queryKey: ['ticketTimer', selected.id],
    queryFn: () => staffFetch(`/api/admin-tickets/${selected.id}/timer`),
    enabled: Boolean(selected?.id),
    refetchInterval: 5000,
  });

  const checklistToggle = useMutation({
    mutationFn: ({ itemId, done }: any) => staffFetch(`/api/admin-tickets/${selected.id}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
    onSuccess: () => {
      proChecklist.refetch();
      proActivity.refetch();
    },
  });

  const addTagMutation = useMutation({
    mutationFn: (tag: string) => staffFetch(`/api/admin-tickets/${selected.id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),
    onSuccess: () => proTags.refetch(),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tag: string) => staffFetch(`/api/admin-tickets/${selected.id}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }),
    onSuccess: () => proTags.refetch(),
  });

  const inviteMutation = useMutation({
    mutationFn: () => staffFetch(`/api/admin-tickets/${selected.id}/team/invite`, {
      method: 'POST',
      body: JSON.stringify({ userId: inviteUserId, note: inviteNote }),
    }),
    onSuccess: () => {
      showMiniToast('تم استدعاء الموظف بنجاح', 'success');
      setInviteUserId('');
      setInviteNote('');
      team.refetch();
      details.refetch();
    },
    onError: (e: any) => {
      showMiniToast('فشل الاستدعاء: ' + (e?.message || 'خطأ غير معروف'), 'error');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => staffFetch(`/api/admin-tickets/${selected.id}/team/${userId}`, {
      method: 'DELETE',
    }),
    onSuccess: () => team.refetch(),
  });

  const elapsed = formatDuration(Number(proTimer.data?.lifecycleSeconds || 0));
  const lifecycleRunning = Boolean(proTimer.data?.lifecycleRunning);

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/40 backdrop-blur-sm">
      {miniToast ? (
        <div className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+14px)] z-[9999]">
          <div className="rounded-[1.5rem] border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              {miniToast.type === 'success'
                ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                : <AlertTriangle className="h-6 w-6 text-red-500" />}
              <div className="text-sm font-black text-slate-900">{miniToast.title}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
            <X className="h-5 w-5" />
          </button>
          <div className="text-right">
            <h2 className="text-lg font-black text-slate-950">تفاصيل التذكرة</h2>
            <p className="text-xs font-bold text-slate-400">#{ticket.ticketNo || selected.id}</p>
          </div>
        </div>

        {details.isLoading ? (
          <div className="p-8 text-center font-black text-slate-400">جاري تحميل التفاصيل...</div>
        ) : (
          <>
            <InfoCard ticket={ticket} elapsed={elapsed} lifecycleRunning={lifecycleRunning} />

            <Section title="يشاهد الآن" icon={<Eye className="h-4 w-4 text-emerald-500" />}>
              <div className="flex flex-wrap gap-2">
                {(proPresence.data || []).length ? (proPresence.data || []).map((p: any) => (
                  <span key={p.id} className="rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                    {p.userName}{p.typing ? ' يكتب...' : ''}
                  </span>
                )) : <span className="text-xs font-bold text-slate-400">لا يوجد أحد حالياً</span>}
              </div>
            </Section>

            <Section title="قائمة الفحص" icon={<ListChecks className="h-4 w-4 text-emerald-500" />}>
              <div className="space-y-2">
                {(proChecklist.data || []).map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => checklistToggle.mutate({ itemId: c.id, done: !c.done })}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm font-black ${
                      c.done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    <span>{c.title}</span>
                    <span>{c.done ? '✓' : '○'}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="الوسوم" icon={<Tag className="h-4 w-4 text-emerald-500" />}>
              <div className="mb-2 flex flex-wrap gap-2">
                {(proTags.data || []).map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => removeTagMutation.mutate(t.tag)}
                    className="rounded-2xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600"
                  >
                    #{t.tag}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {['FTTH', 'PPPoE', 'Billing', 'OLT', 'ONU', 'Slow', 'WiFi'].map((tag) => (
                  <button key={tag} onClick={() => addTagMutation.mutate(tag)} className="rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                    + {tag}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="فريق التذكرة" icon={<Users className="h-4 w-4 text-emerald-500" />}>
              <div className="flex flex-wrap gap-2">
                {(team.data || []).length ? (team.data || []).map((m: any) => (
                  <span key={m.id} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                    {m.fullName || m.username || 'موظف'}
                    <button onClick={() => removeMemberMutation.mutate(m.userId)} className="text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )) : <span className="text-xs font-bold text-slate-400">لا يوجد موظفون مرتبطون بعد</span>}
              </div>

              <div className="mt-3 grid gap-2">
                <select value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} className="h-11 rounded-2xl bg-slate-50 px-3 text-sm font-bold outline-none">
                  <option value="">اختر موظف للاستدعاء</option>
                  {(users.data || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.fullName || u.username}</option>
                  ))}
                </select>

                <input
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder="رسالة الاستدعاء / سبب الحاجة"
                  className="h-11 rounded-2xl bg-slate-50 px-3 text-sm font-bold outline-none placeholder:text-slate-400"
                />

                <button
                  disabled={!inviteUserId || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate()}
                  className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  {inviteMutation.isPending ? 'جاري الاستدعاء...' : 'استدعاء الموظف'}
                </button>
              </div>
            </Section>

            <Section title="Timeline" icon={<Activity className="h-4 w-4 text-emerald-500" />}>
              <div className="space-y-2">
                {(proActivity.data || []).map((a: any) => (
                  <div key={a.id} className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs font-black text-slate-700">{a.userName || 'النظام'} · {a.type}</div>
                    <div className="mt-1 text-sm font-bold text-slate-600">{a.message}</div>
                    <div className="mt-1 text-[10px] font-bold text-slate-400">{new Date(a.createdAt).toLocaleString('ar-IQ')}</div>
                  </div>
                ))}
              </div>
            </Section>

            <div className="mt-4 flex gap-2 overflow-x-auto">
              {['open', 'in_progress', 'pending', 'resolved', 'closed'].map((st) => (
                <button
                  key={st}
                  onClick={() => updateMutation.mutate({ id: selected.id, data: { status: st } })}
                  className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-black ${
                    ticket.status === st ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  {statusMap[st]}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {replies.map((r: any) => (
                <div key={r.id} className="rounded-[1.2rem] bg-slate-50 p-3">
                  <div className="text-xs font-black text-slate-700">{r.authorName || 'النظام'}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-600">{r.body}</div>
                  <div className="mt-2 text-[10px] font-bold text-slate-400">{new Date(r.createdAt).toLocaleString('ar-IQ')}</div>
                </div>
              ))}
            </div>

            {attachments.length ? (
              <div className="mt-4 rounded-[1.2rem] bg-slate-50 p-3">
                <div className="mb-2 text-sm font-black">المرفقات</div>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a: any) => (
                    <a key={a.id} href={a.url} target="_blank" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600">
                      <Paperclip className="ml-1 inline h-4 w-4" />
                      {a.fileName || 'مرفق'}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-[1.5rem] bg-slate-50 p-3">
              <textarea
                rows={4}
                placeholder="اكتب رد..."
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  staffFetch(`/api/admin-tickets/${selected.id}/presence`, {
                    method: 'POST',
                    body: JSON.stringify({ typing: true }),
                  }).catch(() => null);
                }}
                className="w-full resize-none rounded-2xl bg-white p-3 text-sm font-bold outline-none placeholder:text-slate-400"
              />

              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white text-emerald-500">
                  <FileText className="h-5 w-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setReplyFile(e.target.files?.[0] || null)} />
                </label>

                <button
                  disabled={replyMutation.isPending || !reply.trim()}
                  onClick={() => replyMutation.mutate()}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-black text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {replyMutation.isPending ? 'جاري الإرسال...' : 'إرسال رد'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InfoCard({ ticket, elapsed, lifecycleRunning }: any) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge label={statusMap[ticket.status] || ticket.status} color="green" />
        <Badge label={priorityMap[ticket.priority] || ticket.priority} color={ticket.priority === 'urgent' ? 'red' : 'amber'} />
        {ticket.departmentName ? <Badge label={ticket.departmentName} color="slate" /> : null}
      </div>

      <h3 className="mt-3 text-lg font-black text-slate-950">{ticket.subject}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-500">{ticket.description || 'لا يوجد وصف'}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
        <div>المشترك: <b>{ticket.externalName || '—'}</b></div>
        <div>الهاتف: <b>{ticket.externalPhone || '—'}</b></div>
        <div>PPPoE: <b>{ticket.externalPppoe || '—'}</b></div>
        <div className={lifecycleRunning ? 'text-emerald-600' : ''}>
          <Timer className="ml-1 inline h-3.5 w-3.5" />
          الوقت: <b>{elapsed}</b>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: any) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-3 rounded-[1.5rem] bg-white p-3 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="mb-2 flex w-full items-center justify-between text-sm font-black text-slate-800">
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <span className={`text-slate-400 transition ${open ? '' : 'rotate-180'}`}>⌃</span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}
