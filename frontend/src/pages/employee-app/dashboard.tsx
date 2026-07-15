import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  Headphones,
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  TicketCheck,
  Zap,
} from 'lucide-react';
import { adminTicketsApi } from '@/api/adminTickets';
import { listEmployeeCallLogs } from '@/api/callLogs';
import { listLiveCalls } from '@/api/liveCalls';

async function api(path: string) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function startToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء النشاط';
}

function talkFmt(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}س ${m}د` : `${m} دقيقة`;
}

export default function EmployeeDashboardPage() {
  const me = useQuery({ queryKey: ['employeeMe'], queryFn: () => api('/api/auth/me') });

  const tickets = useQuery({
    queryKey: ['employeeDashTickets'],
    queryFn: () => adminTicketsApi.list({ q: '' }),
    refetchInterval: 12000,
  });

  const calls = useQuery({
    queryKey: ['employeeDashCalls'],
    queryFn: () => listEmployeeCallLogs({ from: startToday() } as any),
    refetchInterval: 12000,
  });

  const live = useQuery({
    queryKey: ['employeeDashLiveCalls'],
    queryFn: listLiveCalls,
    refetchInterval: 5000,
  });

  const ticketRows = Array.isArray(tickets.data) ? tickets.data : [];
  const callRows = Array.isArray(calls.data) ? calls.data : [];
  const liveRows = Array.isArray(live.data) ? live.data : [];

  const s = useMemo(() => {
    const openTickets = ticketRows.filter((t: any) =>
      ['new', 'open', 'pending', 'in_progress'].includes(t.status)
    ).length;

    const important = ticketRows.filter((t: any) =>
      ['urgent', 'high'].includes(t.priority) &&
      !['resolved', 'closed'].includes(t.status)
    ).length;

    const missed = callRows.filter((c: any) =>
      ['missed', 'no_answer', 'failed', 'abandoned'].includes(c.disposition)
    ).length;

    const answered = callRows.filter((c: any) => c.disposition === 'answered').length;
    const talk = callRows.reduce((sum: number, c: any) => sum + Number(c.talkTimeSec || c.durationSec || 0), 0);
    const lastCall = [...callRows].sort((a: any, b: any) => +new Date(b.startedAt) - +new Date(a.startedAt))[0];
    const lastTicket = [...ticketRows].sort((a: any, b: any) => +new Date(b.createdAt || b.updatedAt || 0) - +new Date(a.createdAt || a.updatedAt || 0))[0];

    return { openTickets, important, missed, answered, talk, lastCall, lastTicket };
  }, [ticketRows, callRows]);

  const loading = me.isLoading || tickets.isLoading || calls.isLoading || live.isLoading;
  const [availability, setAvailability] = useState<'available' | 'break'>('available');
  const onCall = liveRows.length > 0;
  const isBreak = availability === 'break';

  return (
    <section dir="rtl" className="h-screen overflow-y-auto bg-[#f6f8fb] px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="rounded-[1.7rem] bg-white p-4 shadow-xl shadow-slate-200/70">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-sky-500">Albarq Staff</p>
            <h1 className="mt-1 truncate text-2xl font-black text-slate-950">{greeting()} 👋</h1>
            <p className="mt-1 truncate text-sm font-bold text-slate-400">
              {me.data?.fullName || me.data?.username || 'موظف البرق'}
            </p>
          </div>

          <button
            onClick={() => { me.refetch(); tickets.refetch(); calls.refetch(); live.refetch(); }}
            className="flex h-13 w-13 shrink-0 items-center justify-center rounded-3xl bg-sky-500 p-3 text-white shadow-lg shadow-sky-200"
          >
            {loading ? <RefreshCw className="h-6 w-6 animate-spin" /> : <Headphones className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {(onCall || s.important > 0) && (
        <a
          href={onCall ? '/employee/calls' : '/employee/tickets'}
          className="mt-4 flex items-center justify-between rounded-[1.35rem] bg-slate-950 p-4 text-white shadow-xl shadow-slate-300"
        >
          <div>
            <p className="text-sm font-black">{onCall ? 'توجد مكالمة مباشرة الآن' : 'توجد تنبيهات مهمة'}</p>
            <p className="mt-1 text-xs font-bold text-white/60">
              {onCall ? 'اضغط لفتح صفحة المكالمات' : 'اضغط لمتابعة التذاكر العاجلة'}
            </p>
          </div>
          <Zap className="h-6 w-6 text-yellow-300" />
        </a>
      )}

      <div className="mt-4 rounded-[1.8rem] bg-gradient-to-br from-sky-500 to-cyan-400 p-4 text-white shadow-xl shadow-sky-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black opacity-80">الحالة الحالية</p>
            <h2 className="mt-1 text-3xl font-black">{onCall ? 'على مكالمة' : isBreak ? 'استراحة' : 'متاح'}</h2>
            <p className="mt-1 text-xs font-bold opacity-80">
              {onCall ? `${liveRows.length} مكالمة مباشرة` : isBreak ? 'أنت الآن في وضع الاستراحة' : 'جاهز لاستقبال العمل'}
            </p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/20">
            <CheckCircle2 className="h-9 w-9" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setAvailability('available')}
            className={`rounded-2xl px-3 py-3 text-sm font-black ${!isBreak ? 'bg-white text-sky-600' : 'bg-white/20 text-white'}`}
          >
            متاح
          </button>
          <button
            onClick={() => setAvailability('break')}
            className={`rounded-2xl px-3 py-3 text-sm font-black ${isBreak ? 'bg-white text-sky-600' : 'bg-white/20 text-white'}`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <Coffee className="h-4 w-4" />
              استراحة
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat title="مكالمات اليوم" value={String(callRows.length)} icon={<PhoneCall />} />
        <Stat title="مكالمات فائتة" value={String(s.missed)} icon={<PhoneMissed />} danger={s.missed > 0} />
        <Stat title="تذاكر مفتوحة" value={String(s.openTickets)} icon={<TicketCheck />} />
        {s.important > 0 ? (
          <Stat title="إشعارات" value={String(s.important)} icon={<Bell />} danger />
        ) : null}
      </div>

      <div className="mt-4 rounded-[1.7rem] bg-white p-4 shadow-lg shadow-slate-200/70">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">ملخص اليوم</h2>
          <Clock3 className="h-5 w-5 text-sky-500" />
        </div>
        <div className="space-y-2">
          <Row label="المكالمات المجابة" value={String(s.answered)} />
          <Row label="وقت المكالمات" value={talkFmt(s.talk)} />
          <Row label="آخر مكالمة" value={s.lastCall?.startedAt ? new Date(s.lastCall.startedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : 'لا يوجد'} />
        </div>
      </div>

      <div className="mt-4 rounded-[1.7rem] bg-white p-4 shadow-lg shadow-slate-200/70">
        <h2 className="mb-3 text-lg font-black text-slate-950">آخر نشاط</h2>
        <div className="space-y-2">
          <Activity
            icon={<PhoneCall />}
            title={s.lastCall ? (s.lastCall.callerName || s.lastCall.subscriberName || s.lastCall.callerNumber || 'مكالمة') : 'لا توجد مكالمات'}
            sub={s.lastCall?.startedAt ? new Date(s.lastCall.startedAt).toLocaleString('ar-IQ') : '—'}
          />
          <Activity
            icon={<TicketCheck />}
            title={s.lastTicket ? (s.lastTicket.subject || 'تذكرة') : 'لا توجد تذاكر حديثة'}
            sub={s.lastTicket?.status ? `الحالة: ${s.lastTicket.status}` : '—'}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ title, value, icon, danger }: { title: string; value: string; icon: ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-[1.35rem] bg-white p-4 shadow-lg shadow-slate-200/70">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-500' : 'bg-sky-50 text-sky-500'}`}>
        {icon}
      </div>
      <p className="text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-black text-slate-400">{title}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-black text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function Activity({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-slate-800">{title}</p>
        <p className="mt-0.5 truncate text-xs font-bold text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

