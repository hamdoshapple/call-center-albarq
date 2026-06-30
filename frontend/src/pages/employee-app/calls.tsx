import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  Headphones,
  History,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { listLiveCalls } from '@/api/liveCalls';
import { listEmployeeCallLogs } from '@/api/callLogs';

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 1) return `${s} ث`;
  if (m < 60) return `${m} د ${r} ث`;
  return `${Math.floor(m / 60)} س ${m % 60} د`;
}



export default function EmployeeCallsPage() {
  const meQuery = useQuery({
    queryKey: ['employeeMe'],
    queryFn: () => fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
    }).then((r) => r.json()),
  });

  const me = meQuery.data || {};
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'live' | 'history' | 'missed'>('history');
  const [selected, setSelected] = useState<any | null>(null);

  const live = useQuery({
    queryKey: ['employeeLiveCalls'],
    queryFn: listLiveCalls,
    refetchInterval: 5000,
  });

  const logs = useQuery({
    queryKey: ['employeeCallLogs', q, me?.agentId],
    queryFn: () => listEmployeeCallLogs({ search: q } as any),
    enabled: true,
    refetchInterval: 12000,
  });

  useEffect(() => {
    const openFromUrl = () => {
      const id = new URLSearchParams(window.location.search).get('call') || '';
      if (!id) return;

      const all = [...(live.data || []), ...(logs.data || [])];
      const found = all.find((x: any) => String(x.id) === id || String(x.uniqueId) === id);
      if (found) {
        setSelected(found);
        window.history.replaceState({}, '', '/employee/calls');
      }
    };

    openFromUrl();

    const onMsg = (event: MessageEvent) => {
      const id = event.data?.payload?.callId || event.data?.callId || event.data?.payload?.uniqueId || '';
      if (event.data?.type === 'FORCE_NAVIGATE' && event.data?.url) {
        window.location.href = event.data.url;
        return;
      }
      if (['CALL_OPEN_FROM_PUSH', 'LIVE_CALL_OPEN_FROM_PUSH', 'CALL_LOG_OPEN_FROM_PUSH'].includes(event.data?.type) && id) {
        window.location.href = `/employee/calls?call=${encodeURIComponent(String(id))}`;
      }
    };

    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    window.addEventListener('focus', openFromUrl);

    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onMsg);
      window.removeEventListener('focus', openFromUrl);
    };
  }, [live.data, logs.data]);

  const liveRows = useMemo(() => live.data || [], [live.data]);
  const logRows = useMemo(() => logs.data || [], [logs.data]);

  const missedRows = logRows.filter((x: any) => ['missed', 'no_answer', 'failed'].includes(x.disposition));
  const answeredRows = logRows.filter((x: any) => ['answered'].includes(x.disposition));

  const rows = tab === 'live' ? liveRows : tab === 'missed' ? missedRows : logRows;

  return (
    <section dir="rtl" className="flex h-screen flex-col overflow-hidden bg-[#f6f8fb] px-4 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex shrink-0 items-center justify-between">
        <div>
          <p className="text-sm font-bold text-sky-500">Call Center</p>
          <h1 className="text-3xl font-black text-slate-950">المكالمات</h1>
          
        </div>

        <button
          onClick={() => { live.refetch(); logs.refetch(); }}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-lg shadow-slate-200"
        >
          <RefreshCw className={`h-5 w-5 ${live.isFetching || logs.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
        <MiniCard title="مباشرة" value={String(liveRows.length)} icon={<Headphones className="h-5 w-5" />} />
        <MiniCard title="مجابة" value={String(answeredRows.length)} icon={<PhoneCall className="h-5 w-5" />} />
        <MiniCard title="فائتة" value={String(missedRows.length)} icon={<PhoneMissed className="h-5 w-5" />} danger />
      </div>

      <div className="mt-4 flex shrink-0 items-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-0 w-full bg-transparent text-sm font-black outline-none placeholder:text-slate-400"
          placeholder="بحث برقم أو اسم المشترك..."
        />
      </div>

      <div className="mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
        <Chip active={tab === 'history'} label="السجل" onClick={() => setTab('history')} />
        <Chip active={tab === 'live'} label="المباشرة" onClick={() => setTab('live')} />
        <Chip active={tab === 'missed'} label="الفائتة" onClick={() => setTab('missed')} />
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {live.isLoading || logs.isLoading ? (
          <Empty text="جاري تحميل المكالمات..." />
        ) : rows.length ? (
          rows.map((c: any) => <CallCard key={c.id} call={c} live={tab === 'live'} onOpen={() => setSelected(c)} />)
        ) : (
          <Empty text="لا توجد مكالمات خاصة بك حالياً" />
        )}
      </div>

      {selected ? <CallModal call={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function MiniCard({ title, value, icon, danger }: any) {
  return (
    <div className="rounded-[1.35rem] bg-white p-3 text-center shadow-lg shadow-slate-200/70">
      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-500' : 'bg-sky-50 text-sky-500'}`}>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="text-[11px] font-bold text-slate-400">{title}</p>
    </div>
  );
}

function Chip({ active, label, onClick }: any) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black ${active ? 'bg-sky-500 text-white shadow-lg shadow-sky-100' : 'border border-slate-100 bg-white text-slate-600'}`}>
      {label}
    </button>
  );
}

function CallCard({ call, live, onOpen }: any) {
  const missed = ['missed', 'no_answer', 'failed'].includes(call.disposition);
  const sub = call.subscriber || {};
  const name = call.callerName || call.subscriberName || sub.name || 'مشترك غير معروف';

  return (
    <button onClick={onOpen} className="relative w-full overflow-hidden rounded-[1.65rem] border border-slate-100 bg-white p-4 text-right shadow-lg shadow-slate-200/70 active:scale-[0.99]">
      {live ? <div className="absolute right-0 top-0 h-full w-1.5 bg-emerald-500" /> : missed ? <div className="absolute right-0 top-0 h-full w-1.5 bg-red-500" /> : null}

      <div className="flex items-start gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${missed ? 'bg-red-50 text-red-500' : live ? 'bg-emerald-50 text-emerald-500' : 'bg-sky-50 text-sky-500'}`}>
          {call.direction === 'outbound' ? <PhoneCall className="h-6 w-6" /> : <PhoneIncoming className="h-6 w-6" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-black text-slate-950">{name}</h3>
            <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">
              {live ? 'مباشر' : call.disposition || 'سجل'}
            </span>
          </div>

          <p className="mt-1 truncate text-xs font-bold text-slate-400">
            {call.callerNumber || '—'} ← {call.destinationNumber || '—'}
            {sub.pppoeUsername ? ` · ${sub.pppoeUsername}` : ''}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge label={call.direction === 'outbound' ? 'صادرة' : 'واردة'} />
            <Badge label={fmt(call.durationSec || call.talkTimeSec || 0)} />
            {sub.status ? <Badge label={sub.status} /> : null}
            {sub.package ? <Badge label={sub.package} /> : null}
            {call.recordingId ? <Badge label="تسجيل" /> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function Badge({ label }: any) {
  return <span className="rounded-xl bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">{label}</span>;
}

function Empty({ text }: any) {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-500">
        <Phone className="h-8 w-8" />
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">{text}</h2>
      
    </div>
  );
}

function CallModal({ call, onClose }: any) {
  const sub = call.subscriber || {};
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/40 backdrop-blur-sm">
      <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
            <X className="h-5 w-5" />
          </button>
          <div className="text-right">
            <h2 className="text-lg font-black text-slate-950">تفاصيل المكالمة</h2>
            <p className="text-xs font-bold text-slate-400">{call.id}</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
              <Phone className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-950">{call.callerName || call.subscriberName || sub.name || 'مشترك غير معروف'}</h3>
              <p className="text-sm font-bold text-slate-400">{call.callerNumber || '—'}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
            <div>الوجهة: <b>{call.destinationNumber || '—'}</b></div>
            <div>النوع: <b>{call.direction === 'outbound' ? 'صادرة' : 'واردة'}</b></div>
            <div>الحالة: <b>{call.disposition || call.status || '—'}</b></div>
            <div>
              <Clock3 className="ml-1 inline h-3.5 w-3.5" />
              المدة: <b>{fmt(call.durationSec || call.talkTimeSec || 0)}</b>
            </div>
            <div className="col-span-2">الوقت: <b>{call.startedAt ? new Date(call.startedAt).toLocaleString('ar-IQ') : '—'}</b></div>
          </div>
        </div>

        {sub?.id ? (
          <div className="mt-4 rounded-[1.5rem] bg-sky-50 p-4">
            <h3 className="mb-3 text-sm font-black text-sky-700">معلومات المشترك</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
              <div>الاسم: <b>{sub.name || '—'}</b></div>
              <div>الهاتف: <b>{sub.phone || '—'}</b></div>
              <div>PPPoE: <b>{sub.pppoeUsername || '—'}</b></div>
              <div>الحالة: <b>{sub.status || '—'}</b></div>
              <div>الباقة: <b>{sub.package || sub.speed || '—'}</b></div>
              <div>الدين: <b>{sub.debt ?? '—'}</b></div>
              <div className="col-span-2">العنوان: <b>{sub.address || '—'}</b></div>
            </div>
          </div>
        ) : null}

        {call.recordingId ? (
          <a
            href={`/api/recordings/${call.recordingId}/audio`}
            target="_blank"
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 text-sm font-black text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            تشغيل التسجيل
          </a>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-sm font-black text-slate-400">
            لا يوجد تسجيل مرتبط بهذه المكالمة
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
          <History className="h-4 w-4" />
          تظهر هنا المكالمات الخاصة بنفس الموظف فقط.
        </div>
      </div>
    </div>
  );
}
