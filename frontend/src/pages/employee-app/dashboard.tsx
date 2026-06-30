import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  Headphones,
  MessageCircle,
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  TicketCheck,
} from 'lucide-react';
import { adminTicketsApi } from '@/api/adminTickets';
import { listEmployeeCallLogs } from '@/api/callLogs';
import { listLiveCalls } from '@/api/liveCalls';

async function staffFetch(path: string) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء النشاط';
}

function todayIsoStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}س ${m}د`;
  return `${m}د`;
}

export default function EmployeeDashboardPage() {
  const me = useQuery({
    queryKey: ['employeeMe'],
    queryFn: () => staffFetch('/api/auth/me'),
  });

  const tickets = useQuery({
    queryKey: ['employeeDashboardTickets'],
    queryFn: () => adminTicketsApi.list({ q: '' }),
    refetchInterval: 12000,
  });

  const liveCalls = useQuery({
    queryKey: ['employeeDashboardLiveCalls'],
    queryFn: listLiveCalls,
    refetchInterval: 5000,
  });

  const callLogs = useQuery({
    queryKey: ['employeeDashboardCallLogs'],
    queryFn: () => listEmployeeCallLogs({ from: todayIsoStart() } as any),
    refetchInterval: 12000,
  });

  const ticketRows = Array.isArray(tickets.data) ? tickets.data : [];
  const calls = Array.isArray(callLogs.data) ? callLogs.data : [];
  const live = Array.isArray(liveCalls.data) ? liveCalls.data : [];

  const stats = useMemo(() => {
    const openTickets = ticketRows.filter((t: any) => ['new', 'open', 'pending', 'in_progress'].includes(t.status)).length;
    const urgentTickets = ticketRows.filter((t: any) => ['urgent', 'high'].includes(t.priority)).length;
    const answered = calls.filter((c: any) => c.disposition === 'answered').length;
    const missed = calls.filter((c: any) => ['missed', 'no_answer', 'failed', 'abandoned'].includes(c.disposition)).length;
    const talk = calls.reduce((sum: number, c: any) => sum + Number(c.talkTimeSec || c.durationSec || 0), 0);
    const last = [...calls].sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

    return { openTickets, urgentTickets, answered, missed, talk, last };
  }, [ticketRows, calls]);

  return (
    <section dir="rtl" className="flex h-screen flex-col overflow-y-auto bg-[#f6f8fb] px-4 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-xl shadow-slate-200/70">
        <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-sky-100" />
        <div className="absolute -bottom-12 right-16 h-36 w-36 rounded-full bg-cyan-100" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-sky-500">Albarq Staff</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              {greeting()} 👋
            </h1>
            <p className="mt-2 max-w-[250px] text-sm font-bold leading-6 text-slate-500">
              {me.data?.fullName || me.data?.username || 'موظف البرق'}
            </p>
          </div>

          <button
            onClick={() => {
              me.refetch();
              tickets.refetch();
              liveCalls.refetch();
              callLogs.refetch();
            }}
            className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-500 text-white shadow-lg shadow-sky-200"
          >
            {me.isFetching || tickets.isFetching || liveCalls.isFetching || callLogs.isFetching
              ? <RefreshCw className="h-7 w-7 animate-spin" />
              : <Headphones className="h-7 w-7" />}
          </button>
        </div>
      </header>

      <div className="mt-5 rounded-[1.75rem] bg-gradient-to-br from-sky-500 to-cyan-400 p-4 text-white shadow-xl shadow-sky-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold opacity-90">الحالة الحالية</p>
            <h2 className="mt-1 text-2xl font-black">{live.length ? 'على مكالمة' : 'متاح'}</h2>
            <p className="mt-1 text-xs font-bold opacity-80">
              {live.length ? `${live.length} مكالمة مباشرة` : 'جاهز لاستقبال العمل'}
            </p>
          </div>
          <CheckCircle2 className="h-11 w-11" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white px-3 py-3 text-center text-sm font-black text-sky-600">
            متاح
          </div>
          <div className="rounded-2xl bg-white/20 px-3 py-3 text-center text-sm font-black text-white backdrop-blur">
            <span className="inline-flex items-center gap-1">
              <Coffee className="h-4 w-4" />
              استراحة
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard title="مكالمات اليوم" value={String(calls.length)} icon={<PhoneCall />} />
        <StatCard title="مكالمات فائتة" value={String(stats.missed)} icon={<PhoneMissed />} danger />
        <StatCard title="تذاكر مفتوحة" value={String(stats.openTickets)} icon={<TicketCheck />} />
        <StatCard title="تنبيهات مهمة" value={String(stats.urgentTickets)} icon={<Bell />} danger={stats.urgentTickets > 0} />
      </div>

      <div className="mt-5 rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/70">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">ملخص اليوم</h2>
          <Clock3 className="h-5 w-5 text-sky-500" />
        </div>

        <div className="mt-4 space-y-3">
          <SummaryRow label="المكالمات المجابة" value={String(stats.answered)} />
          <SummaryRow label="وقت المكالمات" value={fmt(stats.talk)} />
          <SummaryRow
            label="آخر مكالمة"
            value={stats.last?.startedAt ? new Date(stats.last.startedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : 'لا يوجد'}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Quick href="/employee/calls" title="المكالمات" icon={<PhoneCall />} />
        <Quick href="/employee/tickets" title="التذاكر" icon={<TicketCheck />} />
        <Quick href="/employee/whatsapp" title="واتساب" icon={<MessageCircle />} />
      </div>
    </section>
  );
}

function StatCard({ title, value, icon, danger }: { title: string; value: string; icon: ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-lg shadow-slate-200/70">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-500' : 'bg-sky-50 text-sky-500'}`}>
        {icon}
      </div>
      <p className="text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-400">{title}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function Quick({ href, title, icon }: { href: string; title: string; icon: ReactNode }) {
  return (
    <a href={href} className="rounded-[1.4rem] bg-white p-4 text-center shadow-lg shadow-slate-200/70 active:scale-[0.98]">
      <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
        {icon}
      </div>
      <div className="text-xs font-black text-slate-600">{title}</div>
    </a>
  );
}
