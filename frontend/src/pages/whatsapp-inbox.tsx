import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Settings,
  Save,
  CheckCircle2,
  Search,
  ExternalLink,
  Clock3,
  Paperclip,
  X,
  Pin,
  Flag,
  Users,
  UserCheck,
  PencilLine,
} from 'lucide-react';
import { whatsappTwilioApi } from '@/api/whatsappTwilio';

type SubscriberLite = {
  id: string;
  name?: string;
  phone?: string;
  pppoeUsername?: string;
  package?: string;
  status?: string;
  source?: string;
  debt?: number;
};

type Conv = {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  lastAt?: string;
  unreadCount: number;
  subscriber?: SubscriberLite | null;
  subscribers?: SubscriberLite[];
  conversationOpen?: boolean;
  windowExpiresAt?: string | null;
  conversationWindowHours?: number;
  pinned?: boolean;
  priority?: 'normal' | 'medium' | 'urgent';
  claimedByName?: string;
  claimedById?: string | null;
};

type Msg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  agentName?: string;
  agentId?: string;
  status: string;
  createdAt: string;
};

export default function WhatsappInboxPage() {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convCursor, setConvCursor] = useState<string | null>(null);
  const [convHasMore, setConvHasMore] = useState(true);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [settings, setSettings] = useState<any>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [filter] = useState<'all' | 'unread' | 'unclaimed' | 'claimed' | 'pinned'>('all');
  const [team, setTeam] = useState<any>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef(0);
  const loadingConvsRef = useRef(false);
  const loadingMoreConvsRef = useRef(false);

  const linkedAccounts = useMemo(() => {
    if (!active) return [];
    return active.subscribers?.length ? active.subscribers : active.subscriber ? [active.subscriber] : [];
  }, [active]);

  const totalDebt = linkedAccounts.reduce((sum, x: any) => sum + Number(x.debt || 0), 0);
  const activeCount = linkedAccounts.filter((x) =>
    String(x.status || '').toLowerCase().includes('active') || String(x.status || '').includes('فعال')
  ).length;
  const expiredCount = linkedAccounts.length ? linkedAccounts.length - activeCount : 0;
  const webhookUrl = useMemo(() => settings?.webhookUrl || '', [settings]);

  const windowRemainingText = useMemo(() => {
    if (!active?.windowExpiresAt) return 'بانتظار أول رسالة';
    const diff = new Date(active.windowExpiresAt).getTime() - Date.now();
    if (diff <= 0) return 'مغلقة';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}س ${m}د متبقية`;
  }, [active?.windowExpiresAt]);


  async function loadConvs(search = q, append = false) {
    if (loadingConvsRef.current && !append) return;
    if (loadingMoreConvsRef.current && append) return;

    if (append) loadingMoreConvsRef.current = true;
    else loadingConvsRef.current = true;

    setErr('');
    setLoading(!append);

    try {
      const params = new URLSearchParams();
      params.set('take', '10');

      if (search.trim()) params.set('q', search.trim());
      if (append && convCursor) params.set('cursor', convCursor);

      const res = await fetch(`/api/whatsapp-twilio/conversations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });

      if (!res.ok) throw new Error('LOAD_FAILED');

      const data = await res.json();
      const list: Conv[] = Array.isArray(data) ? data : (data.rows || []);

      const unreadTotal = list.reduce((n: number, x: any) => n + Number(x.unreadCount || 0), 0);
      if (lastMsgCountRef.current && unreadTotal > lastMsgCountRef.current) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.05;
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 160);
        } catch {}
      }
      lastMsgCountRef.current = unreadTotal;

      setConvCursor(data.nextCursor || null);
      setConvHasMore(Boolean(data.hasMore));

      setConvs((old) => {
        const merged = append ? [...old, ...list] : list;
        const seen = new Set<string>();
        return merged.filter((x) => {
          if (seen.has(x.id)) return false;
          seen.add(x.id);
          return true;
        });
      });

      const currentId = activeIdRef.current;
      if (currentId) {
        const updated = list.find((x: Conv) => x.id === currentId);
        if (updated) {
          setActive((old) => old && old.id === updated.id ? { ...updated, subscriber: old.subscriber, subscribers: old.subscribers, conversationOpen: old.conversationOpen, windowExpiresAt: old.windowExpiresAt } : updated);
        }
      } else if (!append && list[0]) {
        activeIdRef.current = list[0].id;
        setActive(list[0]);
      }
    } catch {
      setErr('فشل تحميل المحادثات');
    } finally {
      loadingConvsRef.current = false;
      loadingMoreConvsRef.current = false;
      setLoading(false);
    }
  }

  async function loadConversationProfile(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/profile`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });
      if (!res.ok) return;
      const profile = await res.json();

      setActive((old) => old && old.id === id ? { ...old, ...profile } : old);
      setConvs((old) => old.map((x) => x.id === id ? { ...x, ...profile } : x));
    } catch {}
  }

  async function apiPost(path: string, body?: any) {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('REQUEST_FAILED');
    return res.json().catch(() => ({}));
  }

  async function loadTeamState(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/team-state`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setTeam(data);
      setActive((old) => old && old.id === id ? { ...old, pinned: data.pinned, priority: data.priority, claimedById: data.claimedById, claimedByName: data.claimedByName } : old);
      setConvs((old) => old.map((x) => x.id === id ? { ...x, pinned: data.pinned, priority: data.priority, claimedById: data.claimedById, claimedByName: data.claimedByName } : x));
    } catch {}
  }

  async function claimActive() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/claim`);
    await loadTeamState(active.id);
    await loadConvs(q, false);
  }

  async function unclaimActive() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/unclaim`);
    await loadTeamState(active.id);
    await loadConvs(q, false);
  }

  async function setPriority(priority: 'normal' | 'medium' | 'urgent') {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/priority`, { priority });
    await loadTeamState(active.id);
    await loadConvs(q, false);
  }

  async function togglePin() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/pin`, { pinned: !team?.pinned });
    await loadTeamState(active.id);
    await loadConvs(q, false);
  }

  async function sendTyping(isTyping: boolean) {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-typing`, { typing: isTyping }).catch(() => null);
  }

  async function quickAction(c: Conv, action: 'pin' | 'claim' | 'urgent' | 'normal') {
    try {
      if (action === 'pin') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/pin`, { pinned: !c.pinned });
      if (action === 'claim') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/claim`);
      if (action === 'urgent' || action === 'normal') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/priority`, { priority: action === 'urgent' ? 'urgent' : 'normal' });
      await loadConvs(q, false);
      if (active?.id === c.id) await loadTeamState(c.id);
    } catch {
      setErr('تعذر تنفيذ العملية');
    }
  }

  async function loadMessages(id: string) {
    try {
      const data = await whatsappTwilioApi.messages(id);
      setMessages(data);
      await whatsappTwilioApi.read(id).catch(() => null);
      setConvs((old) => old.map((x) => (x.id === id ? { ...x, unreadCount: 0 } : x)));
      setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight }), 80);
    } catch {
      setErr('فشل تحميل الرسائل');
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!active || (!text && !fileData)) return;

    setSending(true);
    setErr('');
    try {
      console.log('WA_SEND_DEBUG', { hasFile: !!fileData, fileLen: fileData.length, text });
      const msg = await whatsappTwilioApi.reply(active.id, text, fileData || undefined);
      setMessages((old) => [...old, msg]);
      setReply('');
      setFileData('');
      setFileName('');
      setFileInputKey((x) => x + 1);
      await loadConvs(q, false);
      setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight }), 80);
    } catch {
      setErr('فشل الإرسال. إذا كانت نافذة المحادثة مغلقة، يجب أن يرسل المشترك رسالة جديدة أولاً.');
    } finally {
      setSending(false);
    }
  }

  async function loadSettings() {
    const data = await whatsappTwilioApi.settings();
    setSettings({ ...data, authToken: '' });
  }

  async function saveSettings() {
    setSaveMsg('');
    setErr('');
    try {
      const data = await whatsappTwilioApi.saveSettings(settings);
      setSettings({ ...data, authToken: '' });
      setSaveMsg('تم حفظ الإعدادات');
    } catch {
      setErr('فشل حفظ إعدادات Twilio');
    }
  }

  useEffect(() => {
    loadConvs(q, false);
    loadSettings().catch(() => null);
  }, []);

  const filteredConvs = useMemo(() => {
    return [...convs]
      .sort((a: any, b: any) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        Number(b.unreadCount || 0) - Number(a.unreadCount || 0) ||
        new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime()
      )
      .filter((c: any) => {
        if (filter === 'unread') return Number(c.unreadCount || 0) > 0;
        if (filter === 'unclaimed') return !c.claimedByName && !c.claimedById;
        if (filter === 'claimed') return Boolean(c.claimedByName || c.claimedById);
        if (filter === 'pinned') return Boolean(c.pinned);
        return true;
      });
  }, [convs, filter]);

  const activeWindowOpen = !!active?.windowExpiresAt && new Date(active.windowExpiresAt).getTime() > Date.now();
  const canReply = activeWindowOpen && (!team?.claimedById || team.claimedById === team.myId);

  useEffect(() => {
    setSending(false);
    setErr('');
    if (active?.id) {
      loadMessages(active.id);
      loadConversationProfile(active.id);
      loadTeamState(active.id);
      apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-presence`).catch(() => null);
    }
  }, [active?.id]);

  useEffect(() => {
    const t = setInterval(() => {
      loadConvs(q, false);
      if (active?.id) loadMessages(active.id);
    }, 20000);
    return () => clearInterval(t);
  }, [active?.id, q]);

  return (
    <div className="h-[calc(100vh-105px)] overflow-hidden space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">صندوق واتساب Twilio</h1>
          <p className="text-xs text-slate-500">محادثات واتساب مربوطة بمشتركي البرق Live/Cache</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-white p-1 shadow-sm">
          <button onClick={() => setTab('inbox')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'inbox' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>المحادثات</button>
          <button onClick={() => setTab('settings')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'settings' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>الإعدادات</button>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{err}</div>}

      {tab === 'settings' ? (
        <div className="h-[calc(100vh-175px)] overflow-y-auto rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h2 className="text-lg font-black">إعدادات Twilio WhatsApp</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">Account SID</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.accountSid || ''} onChange={(e) => setSettings({ ...settings, accountSid: e.target.value })} />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">Auth Token</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.authToken || ''} onChange={(e) => setSettings({ ...settings, authToken: e.target.value })} placeholder={settings.authTokenMasked || 'ضع التوكن هنا'} />
              <p className="text-xs text-slate-400">اتركه فارغ إذا ما تريد تغييره.</p>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">WhatsApp From</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.whatsappFrom || ''} onChange={(e) => setSettings({ ...settings, whatsappFrom: e.target.value })} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold">Messaging Service SID</span>
              <input
                className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300"
                value={settings.messagingServiceSid || ''}
                onChange={(e) => setSettings({ ...settings, messagingServiceSid: e.target.value })}
                placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                dir="ltr"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold text-slate-600">مدة نافذة المحادثة / ساعة</span>
              <input
                type="number"
                min={1}
                max={720}
                className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300"
                value={settings.conversationWindowHours || 24}
                onChange={(e) => setSettings({ ...settings, conversationWindowHours: Number(e.target.value || 24) })}
              />
              <p className="text-xs text-slate-400">الافتراضي 24 ساعة من آخر رسالة يرسلها المشترك.</p>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border p-4">
              <input type="checkbox" checked={!!settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              <span className="font-bold">تفعيل الإرسال عبر Twilio</span>
            </label>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-600">Webhook URL داخل Twilio</div>
            <code className="mt-2 block break-all rounded-xl bg-white p-3 text-left text-xs">{webhookUrl}</code>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={saveSettings} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black text-white">
              <Save className="h-4 w-4" /> حفظ
            </button>
            {saveMsg && <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><CheckCircle2 className="h-4 w-4" /> {saveMsg}</span>}
          </div>
        </div>
      ) : (
        <div className="grid h-[calc(100vh-170px)] min-h-[520px] gap-3 lg:grid-cols-[330px_1fr]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="shrink-0 border-b p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-black">المحادثات</div>
                <button onClick={() => { setConvCursor(null); setConvHasMore(true); loadConvs(q, false); }} className="rounded-xl p-2 hover:bg-slate-100">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setConvCursor(null); setConvHasMore(true); loadConvs(e.target.value, false); }}
                  placeholder="بحث: اسم، رقم، يوزر..."
                  className="w-full rounded-2xl border py-2.5 pr-10 pl-3 text-xs outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto p-2"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (convHasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 350) {
                  loadConvs(q, true);
                }
              }}
            >
              {filteredConvs.length === 0 && <div className="p-8 text-center text-xs text-slate-400">ماكو نتائج</div>}
              {filteredConvs.map((c) => {
                const title = c.subscriber?.name || c.name || c.phone;
                return (
                  <button key={c.id} onClick={() => { activeIdRef.current = c.id; setActive(c); }} className={`mb-2 w-full rounded-2xl p-3 text-right transition ${active?.id === c.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="line-clamp-1 text-sm font-black">{title}</div>
                      {c.unreadCount > 0 && <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-black text-white">{c.unreadCount}</span>}
                    </div>
                    <div className={`mt-1 text-xs ${active?.id === c.id ? 'text-slate-200' : 'text-slate-500'}`}>
                      {c.phone}{c.subscriber?.pppoeUsername ? ` • ${c.subscriber.pppoeUsername}` : ''}
                    </div>
                    <div className={`mt-1 line-clamp-1 text-xs ${active?.id === c.id ? 'text-slate-300' : 'text-slate-500'}`}>{c.lastMessage || '—'}</div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.pinned && <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">مثبتة</span>}
                      {c.claimedByName
                        ? <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">مستلمة: {c.claimedByName}</span>
                        : <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">غير مستلمة</span>}
                      {c.priority === 'urgent' && <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">مستعجلة</span>}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      <button
                        title="تثبيت"
                        onClick={() => quickAction(c, 'pin')}
                        className="inline-flex h-7 items-center rounded-full border border-amber-100 bg-amber-50 px-2 text-[10px] font-black text-amber-700 hover:bg-amber-100"
                      >
                        تثبيت
                      </button>
                      <button
                        title="استلام"
                        onClick={() => quickAction(c, 'claim')}
                        className="inline-flex h-7 items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
                      >
                        استلام
                      </button>
                      <button
                        title="مستعجل"
                        onClick={() => quickAction(c, c.priority === 'urgent' ? 'normal' : 'urgent')}
                        className="inline-flex h-7 items-center rounded-full border border-red-100 bg-red-50 px-2 text-[10px] font-black text-red-700 hover:bg-red-100"
                      >
                        مستعجل
                      </button>
                    </div>
                  </button>
                );
              })}
              {convHasMore && <div className="py-3 text-center text-xs font-bold text-slate-400">جاري تحميل المزيد...</div>}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
            {!active ? (
              <div className="m-auto text-center text-slate-400">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-2xl font-black">WA</div>
                اختر محادثة
              </div>
            ) : (
              <>
                <header className="shrink-0 border-b bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-black">{active.subscriber?.name || active.name || active.phone}</div>
                      <div className="text-xs text-slate-400">{active.phone}</div>
                    </div>

                    <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${activeWindowOpen ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-700'}`}>
                      <Clock3 className="h-3.5 w-3.5" />
                      {activeWindowOpen ? `نافذة مفتوحة • ${windowRemainingText}` : 'انتهت نافذة المراسلة'}
                    </div>
                    {linkedAccounts.length === 0 && (
                      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">غير مرتبط بمشترك</div>
                    )}
                  </div>

                  <TeamPanel
                    team={team}
                    onClaim={claimActive}
                    onUnclaim={unclaimActive}
                    onPriority={setPriority}
                    onTogglePin={togglePin}
                  />

                  {linkedAccounts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gradient-to-l from-green-50 to-emerald-50 px-3 py-2 text-xs">
                      <div className="flex min-w-[180px] items-center gap-2 font-black text-green-900">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-[10px] font-black text-white">م</span>
                        <span className="line-clamp-1">{linkedAccounts[0]?.name || 'مشترك'}</span>
                      </div>

                      <button onClick={() => setAccountsOpen(true)} className="rounded-xl bg-white px-3 py-1.5 font-black text-slate-900 hover:bg-green-100">
                        {linkedAccounts.length} حساب
                      </button>

                      <span className="rounded-xl bg-white px-3 py-1.5 font-black text-green-700">{activeCount} فعال</span>
                      <span className="rounded-xl bg-white px-3 py-1.5 font-black text-red-600">{expiredCount} منتهي</span>
                      <span className={`rounded-xl bg-white px-3 py-1.5 font-black ${totalDebt > 0 ? 'text-red-600' : 'text-green-700'}`}>
                        ديون: {totalDebt.toLocaleString('en-US')} د.ع
                      </span>

                      <button onClick={() => setAccountsOpen(true)} className="mr-auto rounded-xl bg-slate-900 px-4 py-1.5 font-black text-white">
                        عرض الحسابات
                      </button>
                    </div>
                  )}
                </header>

                <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                  {messages.map((m) => {
                    const out = m.direction === 'outbound';
                    return (
                      <div key={m.id} className={`flex ${out ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs shadow-sm ${out ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
                          {out && m.agentName && (
                            <div className="mb-1 text-[10px] font-black text-slate-300">
                              رد بواسطة: {m.agentName}
                            </div>
                          )}
                          {m.mediaUrl && (
                            m.mediaType?.startsWith('image/') ? (
                              <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                                <img src={m.mediaUrl} className="mb-2 max-h-72 max-w-full rounded-2xl object-contain" />
                              </a>
                            ) : (
                              <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 inline-flex rounded-xl bg-white/20 px-3 py-2 font-black underline">
                                فتح الملف المرفق
                              </a>
                            )
                          )}
                          {m.body && !(m.mediaUrl && m.body === '.') && <div className="whitespace-pre-wrap">{m.body}</div>}
                          <div className={`mt-2 text-[10px] ${out ? 'text-slate-300' : 'text-slate-400'}`}>
                            {new Date(m.createdAt).toLocaleString('ar-IQ')} • {m.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <footer className="shrink-0 border-t bg-white p-3">
                  {fileName && (
                    <div className="mb-2 inline-flex items-center gap-2 rounded-2xl bg-green-50 px-3 py-2 text-xs font-black text-green-700">
                      {fileName}
                      <button onClick={() => { setFileData(''); setFileName(''); setFileInputKey((x) => x + 1); }}><X className="h-4 w-4" /></button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <label className="inline-flex h-[46px] min-w-[46px] cursor-pointer items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200">
                      <Paperclip className="h-4 w-4 text-slate-600" />
                      <input
                        key={fileInputKey}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 4 * 1024 * 1024) {
                            setErr('حجم الملف كبير، اختار أقل من 4MB');
                            return;
                          }
                          const r = new FileReader();
                          r.onload = () => {
                            setFileData(String(r.result || ''));
                            setFileName(f.name);
                            e.currentTarget.value = '';
                          };
                          r.readAsDataURL(f);
                        }}
                      />
                    </label>

                    <textarea
                      value={reply}
                      onChange={(e) => {
                        setReply(e.target.value);
                        sendTyping(Boolean(e.target.value.trim())).catch(() => null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendReply();
                        }
                      }}
                      className="max-h-28 min-h-[46px] flex-1 resize-none rounded-2xl border p-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder={canReply ? "اكتب الرد هنا..." : "المحادثة مستلمة من موظف آخر أو نافذة الرد مغلقة"}
                    />

                    <button disabled={sending || !canReply || (!reply.trim() && !fileData)} onClick={sendReply} className="inline-flex h-[46px] items-center rounded-2xl bg-green-600 px-6 text-sm font-black text-white disabled:opacity-50">
                      إرسال
                    </button>
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
      )}

      {accountsOpen && (
        <div className="fixed inset-0 z-[999] bg-black/30 backdrop-blur-sm" onClick={() => setAccountsOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">الحسابات المرتبطة</h2>
                <p className="text-xs text-slate-500">{active?.phone}</p>
              </div>
              <button onClick={() => setAccountsOpen(false)} className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black">إغلاق</button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-slate-100 p-3 text-center">
                <div className="text-2xl font-black">{linkedAccounts.length}</div>
                <div className="text-xs text-slate-500">حسابات</div>
              </div>
              <div className="rounded-2xl bg-green-50 p-3 text-center">
                <div className="text-2xl font-black text-green-700">{activeCount}</div>
                <div className="text-xs text-green-700">فعال</div>
              </div>
              <div className="rounded-2xl bg-red-50 p-3 text-center">
                <div className="text-2xl font-black text-red-600">{expiredCount}</div>
                <div className="text-xs text-red-600">منتهي</div>
              </div>
            </div>

            <div className="space-y-3">
              {linkedAccounts.map((sub: any) => {
                const isActive = String(sub.status || '').toLowerCase().includes('active') || String(sub.status || '').includes('فعال');
                const debt = Number(sub.debt || 0);
                return (
                  <div key={sub.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-slate-900">{sub.name || '—'}</div>
                        <div className="text-xs text-slate-500">{sub.phone || active?.phone}</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {sub.status || (isActive ? 'فعال' : 'غير فعال')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">اليوزر</div>
                        <div className="font-black">{sub.pppoeUsername || '—'}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">الباقة</div>
                        <div className="font-black">{sub.package || '—'}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">الدين</div>
                        <div className={`font-black ${debt > 0 ? 'text-red-600' : 'text-green-700'}`}>{debt.toLocaleString('en-US')} د.ع</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs text-slate-400">المصدر</div>
                        <div className="font-black">{sub.source || 'auto'}</div>
                      </div>
                    </div>

                    <a href={`/subscribers/${sub.id}`} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white">
                      فتح الحساب <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function TeamPanel({ team, onClaim, onUnclaim, onPriority, onTogglePin }: any) {
  const mine = team?.claimedById && team.claimedById === team.myId;
  const claimed = Boolean(team?.claimedById);
  const typing = (team?.typing || []).filter((x: any) => x.id !== team?.myId);
  const viewers = (team?.viewers || []).filter((x: any) => x.id !== team?.myId);

  return (
    <div className="mb-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Users className="h-4 w-4 text-emerald-600" />
            {claimed ? `مستلمة بواسطة ${team?.claimedByName}` : 'غير مستلمة'}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-400">
            {typing.length ? <PencilLine className="h-3 w-3 text-emerald-500" /> : <UserCheck className="h-3 w-3" />}
            <span className="truncate">
              {typing.length
                ? `${typing.map((x: any) => x.name).join('، ')} يكتب الآن...`
                : viewers.length
                  ? `يشاهدها: ${viewers.map((x: any) => x.name).join('، ')}`
                  : 'لا يوجد موظف آخر يشاهدها الآن'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onTogglePin} className={`rounded-xl px-3 py-2 text-[11px] font-black ${team?.pinned ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'}`}>
            <Pin className="ml-1 inline h-3.5 w-3.5" />
            تثبيت
          </button>

          {mine ? (
            <button onClick={onUnclaim} className="rounded-xl bg-white px-3 py-2 text-[11px] font-black text-slate-600">ترك</button>
          ) : (
            <button onClick={onClaim} className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white">استلام</button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button onClick={() => onPriority('normal')} className={`rounded-xl py-2 text-[10px] font-black ${team?.priority === 'normal' || !team?.priority ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>
          <Flag className="ml-1 inline h-3 w-3" />عادي
        </button>
        <button onClick={() => onPriority('medium')} className={`rounded-xl py-2 text-[10px] font-black ${team?.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-400'}`}>
          <Flag className="ml-1 inline h-3 w-3" />متوسط
        </button>
        <button onClick={() => onPriority('urgent')} className={`rounded-xl py-2 text-[10px] font-black ${team?.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-white text-slate-400'}`}>
          <Flag className="ml-1 inline h-3 w-3" />مستعجل
        </button>
      </div>
    </div>
  );
}
