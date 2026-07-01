import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Flag,
  Info,
  Paperclip,
  PencilLine,
  Pin,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { whatsappTwilioApi } from '@/api/whatsappTwilio';
import { enableAdminPush } from './adminPush';

type SubscriberLite = {
  id: string;
  name?: string;
  phone?: string;
  pppoeUsername?: string;
  package?: string;
  status?: string;
  source?: string;
  debt?: number;
  speed?: string;
  expiration?: string;
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

const token = () => localStorage.getItem('cc_token') || localStorage.getItem('token') || '';

async function apiPost(path: string, body?: any) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json().catch(() => ({}));
}

function fmtDate(v?: string) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('ar-IQ'); } catch { return String(v); }
}

function money(n: any) {
  return Number(n || 0).toLocaleString('en-US');
}

function isActiveSub(s: any) {
  return String(s?.status || '').toLowerCase().includes('active') || String(s?.status || '').includes('فعال');
}

async function imageToJpegDataUrl(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function WhatsappInboxPage() {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [team, setTeam] = useState<any>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'unclaimed' | 'claimed' | 'pinned'>('all');
  const [reply, setReply] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [settings, setSettings] = useState<any>({});
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [pushMsg, setPushMsg] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  const linkedAccounts = useMemo(() => {
    if (!active) return [];
    return active.subscribers?.length ? active.subscribers : active.subscriber ? [active.subscriber] : [];
  }, [active]);

  const totalDebt = linkedAccounts.reduce((sum, x: any) => sum + Number(x.debt || 0), 0);
  const activeCount = linkedAccounts.filter(isActiveSub).length;
  const expiredCount = linkedAccounts.length ? linkedAccounts.length - activeCount : 0;

  const activeWindowOpen = Boolean(active?.conversationOpen) || (!!active?.windowExpiresAt && new Date(active.windowExpiresAt).getTime() > Date.now());
  const canReply = activeWindowOpen && (!team?.claimedById || team.claimedById === team.myId);

  const windowText = useMemo(() => {
    if (!active?.windowExpiresAt) return 'بانتظار أول رسالة';
    const diff = new Date(active.windowExpiresAt).getTime() - Date.now();
    if (diff <= 0) return 'مغلقة';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}س ${m}د متبقية`;
  }, [active?.windowExpiresAt]);

  const filtered = useMemo(() => {
    return [...convs]
      .sort((a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        Number(b.unreadCount || 0) - Number(a.unreadCount || 0) ||
        new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime()
      )
      .filter((c) => {
        if (filter === 'unread') return Number(c.unreadCount || 0) > 0;
        if (filter === 'unclaimed') return !c.claimedByName && !c.claimedById;
        if (filter === 'claimed') return Boolean(c.claimedByName || c.claimedById);
        if (filter === 'pinned') return Boolean(c.pinned);
        return true;
      });
  }, [convs, filter]);

  const pinnedConvs = filtered.filter((x) => Boolean(x.pinned));
  const normalConvs = filtered.filter((x) => !x.pinned);

  async function loadConvs(search = q) {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('take', '80');
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/whatsapp-twilio/conversations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      const rows: Conv[] = Array.isArray(data) ? data : (data.rows || []);
      setConvs(rows);

      if (activeIdRef.current) {
        const updated = rows.find((x) => x.id === activeIdRef.current);
        if (updated) {
          setActive((old) => old ? {
            ...old,
            ...updated,
            conversationOpen: updated.conversationOpen ?? old.conversationOpen,
            windowExpiresAt: updated.windowExpiresAt ?? old.windowExpiresAt,
            conversationWindowHours: updated.conversationWindowHours ?? old.conversationWindowHours,
          } : updated);
        }
      } else if (rows[0]) {
        activeIdRef.current = rows[0].id;
        setActive(rows[0]);
      }
    } catch {
      setErr('فشل تحميل المحادثات');
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/profile`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const profile = await res.json();
      setActive((old) => old && old.id === id ? { ...old, ...profile } : old);
      setConvs((old) => old.map((x) => x.id === id ? { ...x, ...profile } : x));
    } catch {}
  }

  async function loadTeam(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/team-state`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setTeam(data);
      setActive((old) => old && old.id === id ? { ...old, ...data } : old);
      setConvs((old) => old.map((x) => x.id === id ? { ...x, ...data } : x));
    } catch {}
  }

  async function loadMessages(id: string) {
    try {
      const data = await whatsappTwilioApi.messages(id);
      setMessages(Array.isArray(data) ? data : []);
      await whatsappTwilioApi.read(id).catch(() => null);
      setConvs((old) => old.map((x) => x.id === id ? { ...x, unreadCount: 0 } : x));
      setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight }), 80);
    } catch {
      setErr('فشل تحميل الرسائل');
    }
  }

  async function openConv(c: Conv) {
    activeIdRef.current = c.id;
    setActive(c);
  }

  async function claim() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/claim`);
    await loadTeam(active.id);
    await loadConvs(q);
  }

  async function unclaim() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/unclaim`);
    await loadTeam(active.id);
    await loadConvs(q);
  }

  async function setPriority(priority: 'normal' | 'medium' | 'urgent') {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/priority`, { priority });
    await loadTeam(active.id);
    await loadConvs(q);
  }

  async function togglePin() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/pin`, { pinned: !team?.pinned });
    await loadTeam(active.id);
    await loadConvs(q);
  }

  async function quickAction(c: Conv, action: 'pin' | 'claim' | 'urgent' | 'normal') {
    try {
      if (action === 'pin') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/pin`, { pinned: !c.pinned });
      if (action === 'claim') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/claim`);
      if (action === 'urgent' || action === 'normal') await apiPost(`/api/whatsapp-twilio/conversations/${c.id}/priority`, { priority: action === 'urgent' ? 'urgent' : 'normal' });
      await loadConvs(q);
      if (active?.id === c.id) await loadTeam(c.id);
    } catch {
      setErr('تعذر تنفيذ العملية');
    }
  }

  async function sendTyping(v: boolean) {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-typing`, { typing: v }).catch(() => null);
  }

  function onReply(v: string) {
    setReply(v);
    sendTyping(Boolean(v.trim())).catch(() => null);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => sendTyping(false).catch(() => null), 3000);
  }

  async function sendReply() {
    const text = reply.trim();
    if (!active || (!text && !fileData)) return;

    setSending(true);
    setErr('');
    try {
      const msg = await (whatsappTwilioApi.reply as any)(active.id, text || '.', fileData || undefined, fileName || undefined, fileType || undefined);
      setMessages((old) => [...old, msg]);
      setReply('');
      setFileData('');
      setFileName('');
      setFileType('');
      setFileInputKey((x) => x + 1);
      await sendTyping(false);
      await loadConvs(q);
      if (active?.id) {
        await loadProfile(active.id);
        await loadTeam(active.id);
      }
      setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight }), 80);
    } catch {
      setErr('فشل الإرسال. إذا نافذة المحادثة مغلقة، يجب أن يرسل المشترك رسالة جديدة أولاً.');
    } finally {
      setSending(false);
    }
  }

  async function handleFile(f?: File) {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      setErr('حجم الملف كبير جداً');
      return;
    }

    if (f.type.startsWith('image/')) {
      setFileData(await imageToJpegDataUrl(f));
      setFileName((f.name || 'image').replace(/\.[^.]+$/, '') + '.jpg');
      setFileType('image/jpeg');
      return;
    }

    const r = new FileReader();
    r.onload = () => {
      setFileData(String(r.result || ''));
      setFileName(f.name);
      setFileType(f.type || 'application/octet-stream');
    };
    r.readAsDataURL(f);
  }

  async function loadSettings() {
    const data = await whatsappTwilioApi.settings();
    setSettings({ ...data, authToken: '' });
  }

  async function activateAdminPush() {
    setPushLoading(true);
    setPushMsg('');
    try {
      const r = await enableAdminPush();
      setPushMsg(r.message || (r.ok ? 'تم تفعيل الإشعارات' : 'تعذر التفعيل'));
    } catch {
      setPushMsg('تعذر تفعيل الإشعارات');
    } finally {
      setPushLoading(false);
      setTimeout(() => setPushMsg(''), 2500);
    }
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
    loadConvs('');
    loadSettings().catch(() => null);

    if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('admin_push_enabled') === '1') {
      enableAdminPush().catch(() => null);
    }
  }, []);

  useEffect(() => {
    if (!active?.id) return;
    loadMessages(active.id);
    loadProfile(active.id);
    loadTeam(active.id);
    apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-presence`).catch(() => null);
    const t = window.setInterval(() => {
      loadTeam(active.id);
      apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-presence`).catch(() => null);
    }, 12000);
    return () => window.clearInterval(t);
  }, [active?.id]);

  useEffect(() => {
    const t = window.setInterval(() => {
      loadConvs(q);
      if (active?.id) loadMessages(active.id);
    }, 20000);
    return () => window.clearInterval(t);
  }, [q, active?.id]);

  useEffect(() => {
    const chat = new URLSearchParams(window.location.search).get('chat') || '';
    if (!chat || !(convs || []).length) return;
    const found = convs.find((x) => x.id === chat);
    if (found) {
      activeIdRef.current = found.id;
      setActive(found);
      window.history.replaceState({}, '', '/whatsapp-inbox');
    }
  }, [convs.length]);

  return (
    <div dir="rtl" className="h-[calc(100vh-92px)] overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-950">Twilio واتساب</h1>
            <p className="text-xs font-bold text-slate-400">Live/Cache متصل • صندوق رسائل العملاء</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pushMsg ? <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">{pushMsg}</span> : null}

          <button
            onClick={activateAdminPush}
            disabled={pushLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            {pushLoading ? 'تفعيل...' : 'تفعيل الإشعارات'}
          </button>

          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
          <button onClick={() => setTab('inbox')} className={`rounded-xl px-4 py-2 text-xs font-black ${tab === 'inbox' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>المحادثات</button>
          <button onClick={() => setTab('settings')} className={`rounded-xl px-4 py-2 text-xs font-black ${tab === 'settings' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>الإعدادات</button>
          </div>
        </div>
      </div>

      {err ? <div className="m-3 rounded-2xl bg-red-50 p-3 text-xs font-black text-red-600">{err}</div> : null}

      {tab === 'settings' ? (
        <SettingsPanel settings={settings} setSettings={setSettings} saveSettings={saveSettings} saveMsg={saveMsg} webhookUrl={settings?.webhookUrl || ''} />
      ) : (
        <div className="grid h-[calc(100%-4rem)] grid-cols-[330px_1fr_320px] overflow-hidden">
          <aside className="min-h-0 border-l bg-white">
            <div className="border-b p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black text-slate-950">المحادثات</h2>
                <button onClick={() => loadConvs(q)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); loadConvs(e.target.value); }}
                  placeholder="بحث: اسم، رقم، يوزر..."
                  className="w-full rounded-2xl border bg-white py-2.5 pr-10 pl-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
                <Chip active={filter === 'all'} label="الكل" onClick={() => setFilter('all')} />
                <Chip active={filter === 'unread'} label="غير المقروءة" onClick={() => setFilter('unread')} />
                <Chip active={filter === 'unclaimed'} label="غير مستلمة" onClick={() => setFilter('unclaimed')} />
                <Chip active={filter === 'claimed'} label="مستلمة" onClick={() => setFilter('claimed')} />
                <Chip active={filter === 'pinned'} label="مثبتة" onClick={() => setFilter('pinned')} />
              </div>
            </div>

            <div className="h-full overflow-y-auto pb-16">
              {pinnedConvs.length ? (
                <ConversationSection title={`المثبتة (${pinnedConvs.length})`} pinned>
                  {pinnedConvs.map((c) => (
                    <ConvCard key={c.id} conv={c} active={active?.id === c.id} onOpen={() => openConv(c)} onAction={quickAction} />
                  ))}
                </ConversationSection>
              ) : null}

              {normalConvs.length ? (
                <ConversationSection title={pinnedConvs.length ? 'باقي المحادثات' : 'المحادثات'}>
                  {normalConvs.map((c) => (
                    <ConvCard key={c.id} conv={c} active={active?.id === c.id} onOpen={() => openConv(c)} onAction={quickAction} />
                  ))}
                </ConversationSection>
              ) : null}

              {!filtered.length ? <div className="p-8 text-center text-xs font-bold text-slate-400">ماكو نتائج</div> : null}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col bg-slate-50">
            {!active ? (
              <div className="m-auto text-center text-slate-400">اختر محادثة</div>
            ) : (
              <>
                <header className="border-b bg-white p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-slate-950">{active.subscriber?.name || active.name || active.phone}</h2>
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-400">{active.phone}</p>
                    </div>

                    <div className={`rounded-2xl px-3 py-2 text-xs font-black ${activeWindowOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      <Clock3 className="ml-1 inline h-3.5 w-3.5" />
                      {activeWindowOpen ? `نافذة مفتوحة • ${windowText}` : 'نافذة الرد مغلقة'}
                    </div>
                  </div>

                  <div className="grid grid-cols-[1.2fr_1fr] gap-3">
                    <TeamPanel team={team} onClaim={claim} onUnclaim={unclaim} onPriority={setPriority} onTogglePin={togglePin} />
                    <QuickStats linkedAccounts={linkedAccounts} activeCount={activeCount} expiredCount={expiredCount} totalDebt={totalDebt} />
                  </div>
                </header>

                <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f8fafc] p-5">
                  {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
                </div>

                <footer className="border-t bg-white p-3">
                  {fileName ? (
                    <div className="mb-2 inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                      {fileName}
                      <button onClick={() => { setFileData(''); setFileName(''); setFileType(''); setFileInputKey((x) => x + 1); }}><X className="h-4 w-4" /></button>
                    </div>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                      <Paperclip className="h-5 w-5" />
                      <input key={fileInputKey} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                    </label>

                    <textarea
                      value={reply}
                      onChange={(e) => onReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border bg-slate-50 p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-100"
                      placeholder={canReply ? 'اكتب الرد هنا...' : 'المحادثة مستلمة من موظف آخر أو نافذة الرد مغلقة'}
                    />

                    <button disabled={sending || !canReply || (!reply.trim() && !fileData)} onClick={sendReply} className="flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-100 disabled:opacity-50">
                      <Send className="h-4 w-4" />
                      إرسال
                    </button>
                  </div>
                </footer>
              </>
            )}
          </main>

          <aside className="min-h-0 border-r bg-white p-4">
            <CustomerPanel
              active={active}
              linkedAccounts={linkedAccounts}
              activeCount={activeCount}
              expiredCount={expiredCount}
              totalDebt={totalDebt}
              team={team}
              onClaim={claim}
              onPin={togglePin}
              onUrgent={() => setPriority('urgent')}
              onOpenAccounts={() => setAccountsOpen(true)}
            />
          </aside>
        </div>
      )}

      {accountsOpen ? (
        <AccountsDrawer
          active={active}
          linkedAccounts={linkedAccounts}
          activeCount={activeCount}
          expiredCount={expiredCount}
          totalDebt={totalDebt}
          onClose={() => setAccountsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Chip({ active, label, onClick }: any) {
  return <button onClick={onClick} className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black ${active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`}>{label}</button>;
}



function ConversationSection({ title, pinned, children }: { title: string; pinned?: boolean; children: React.ReactNode }) {
  const key = pinned ? 'waPinnedCollapsed' : 'waNormalCollapsed';
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(key) === '1');

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(key, next ? '1' : '0');
  }

  return (
    <section className="mb-3">
      <button
        onClick={toggle}
        className={`sticky top-0 z-20 mx-2 mb-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-2xl border px-4 py-3 text-right backdrop-blur transition ${
          pinned
            ? 'border-amber-200 bg-amber-50/95 text-amber-900'
            : 'border-slate-200 bg-slate-50/95 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2">
          {pinned ? <Pin className="h-4 w-4" /> : <Users className="h-4 w-4 text-slate-400" />}
          <span className="text-sm font-black">{title}</span>
        </div>

        {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
      </button>

      {!collapsed ? (
        <div className="space-y-1">
          {children}
        </div>
      ) : null}
    </section>
  );
}


function ConvCard({ conv, active, onOpen, onAction }: any) {
  const title = conv.subscriber?.name || conv.name || conv.phone;
  return (
    <button onClick={onOpen} className={`w-full border-b p-3 text-right transition ${
        active
          ? 'bg-emerald-50'
          : conv.pinned
            ? 'bg-amber-50/55 hover:bg-amber-50'
            : 'bg-white hover:bg-slate-50'
      }`}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
          {(title || 'م').slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <h3 className="truncate text-sm font-black text-slate-950">{title}</h3>
            <span className="shrink-0 text-[10px] font-bold text-slate-400">{conv.lastAt ? new Date(conv.lastAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-400">{conv.phone}</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-500">{conv.lastMessage || '—'}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {conv.unreadCount > 0 && <Badge color="green">{conv.unreadCount}</Badge>}
            {conv.pinned && <Badge color="amber">مثبتة</Badge>}
            {conv.claimedByName ? <Badge color="emerald">مستلمة: {conv.claimedByName}</Badge> : <Badge color="slate">غير مستلمة</Badge>}
            {conv.priority === 'urgent' && <Badge color="red">مستعجلة</Badge>}
          </div>

          <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
            <IconBtn title="تثبيت" onClick={() => onAction(conv, 'pin')}><Pin className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="استلام" onClick={() => onAction(conv, 'claim')}><UserCheck className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="مستعجل" onClick={() => onAction(conv, conv.priority === 'urgent' ? 'normal' : 'urgent')}><Flag className="h-3.5 w-3.5" /></IconBtn>
          </div>
        </div>
      </div>
    </button>
  );
}

function IconBtn({ children, onClick, title }: any) {
  return <button title={title} onClick={onClick} className="flex h-7 w-9 items-center justify-center rounded-xl border bg-white text-slate-600 hover:bg-slate-100">{children}</button>;
}

function Badge({ color, children }: any) {
  const cls =
    color === 'green' ? 'bg-emerald-600 text-white' :
    color === 'emerald' ? 'bg-emerald-50 text-emerald-700' :
    color === 'amber' ? 'bg-amber-50 text-amber-700' :
    color === 'red' ? 'bg-red-50 text-red-700' :
    'bg-slate-100 text-slate-500';
  return <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${cls}`}>{children}</span>;
}

function TeamPanel({ team, onClaim, onUnclaim, onPriority, onTogglePin }: any) {
  const mine = team?.claimedById && team.claimedById === team.myId;
  const typing = (team?.typing || []).filter((x: any) => x.id !== team?.myId);
  const viewers = (team?.viewers || []).filter((x: any) => x.id !== team?.myId);

  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-700">
            <Users className="ml-1 inline h-4 w-4 text-emerald-600" />
            {team?.claimedByName ? `مستلمة بواسطة ${team.claimedByName}` : 'غير مستلمة'}
          </p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {typing.length ? <PencilLine className="ml-1 inline h-3 w-3 text-emerald-500" /> : null}
            {typing.length ? `${typing.map((x: any) => x.name).join('، ')} يكتب الآن...` : viewers.length ? `يشاهدها: ${viewers.map((x: any) => x.name).join('، ')}` : 'لا يوجد موظف آخر يشاهدها الآن'}
          </p>
        </div>

        <div className="flex gap-1">
          <button onClick={onTogglePin} className={`rounded-xl px-3 py-2 text-[11px] font-black ${team?.pinned ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>تثبيت</button>
          {mine ? (
            <button onClick={onUnclaim} className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-600">ترك</button>
          ) : (
            <button onClick={onClaim} className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white">استلام</button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border">
        {(['normal', 'medium', 'urgent'] as const).map((p) => (
          <button key={p} onClick={() => onPriority(p)} className={`py-2 text-xs font-black ${
            team?.priority === p || (!team?.priority && p === 'normal')
              ? p === 'urgent' ? 'bg-red-50 text-red-700' : p === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              : 'bg-white text-slate-400'
          }`}>
            {p === 'normal' ? 'عادي' : p === 'medium' ? 'متوسط' : 'مستعجل'}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickStats({ linkedAccounts, activeCount, expiredCount, totalDebt }: any) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-black text-slate-700">
        <Info className="ml-1 inline h-4 w-4 text-slate-500" />
        معلومات سريعة
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="حساب" value={linkedAccounts.length} color="sky" />
        <Stat label="فعال" value={activeCount} color="green" />
        <Stat label="منتهي" value={expiredCount} color="red" />
        <Stat label="إجمالي الديون" value={money(totalDebt)} color="orange" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: any) {
  const cls = color === 'green' ? 'bg-emerald-50 text-emerald-700' : color === 'red' ? 'bg-red-50 text-red-700' : color === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700';
  return <div className={`rounded-xl p-2 text-center ${cls}`}><div className="font-black">{value}</div><div className="text-[10px] font-bold">{label}</div></div>;
}

function MessageBubble({ msg }: { msg: Msg }) {
  const out = msg.direction === 'outbound';
  return (
    <div className={`flex ${out ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm shadow-sm ${out ? 'bg-emerald-100 text-emerald-950 rounded-br-md' : 'bg-white text-slate-900 rounded-bl-md'}`}>
        {out && msg.agentName ? <div className="mb-1 text-[10px] font-black text-emerald-700">{msg.agentName}</div> : null}
        {msg.mediaUrl ? msg.mediaType?.startsWith('image/') ? (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer"><img src={msg.mediaUrl} className="mb-2 max-h-72 rounded-2xl object-contain" /></a>
        ) : (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 inline-flex rounded-xl bg-white/50 px-3 py-2 text-xs font-black underline">فتح المرفق</a>
        ) : null}
        {msg.body && !(msg.mediaUrl && msg.body === '.') ? <div className="whitespace-pre-wrap font-bold leading-6">{msg.body}</div> : null}
        <div className="mt-2 text-[10px] font-bold opacity-60">{fmtDate(msg.createdAt)} • {msg.status}</div>
      </div>
    </div>
  );
}

function CustomerPanel({ active, linkedAccounts, activeCount, expiredCount, totalDebt, team, onClaim, onPin, onUrgent, onOpenAccounts }: any) {
  if (!active) return <div className="text-center text-sm font-bold text-slate-400">اختر محادثة</div>;
  const name = active.subscriber?.name || active.name || active.phone;

  return (
    <div className="space-y-3">
      <h2 className="font-black text-slate-950">تفاصيل المشترك</h2>

      <div className="rounded-2xl border p-4 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-2xl font-black text-white">{name.slice(0, 1)}</div>
        <h3 className="mt-3 text-lg font-black text-slate-950">{name}</h3>
        <p className="text-xs font-bold text-slate-400">{active.phone}</p>
        {team?.claimedByName ? <div className="mx-auto mt-3 w-fit rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">مستلمة بواسطة {team.claimedByName}</div> : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={onClaim} className="rounded-xl border bg-white py-2 text-xs font-black text-emerald-700">استلام</button>
          <button onClick={onUrgent} className="rounded-xl border bg-white py-2 text-xs font-black text-red-700">مستعجلة</button>
          <button onClick={onPin} className="rounded-xl border bg-white py-2 text-xs font-black text-amber-700">مثبتة</button>
        </div>
      </div>

      <QuickStats linkedAccounts={linkedAccounts} activeCount={activeCount} expiredCount={expiredCount} totalDebt={totalDebt} />

      <div className="space-y-2">
        {linkedAccounts.slice(0, 3).map((s: any) => (
          <div key={s.id} className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="flex justify-between gap-2">
              <div>
                <p className="text-sm font-black text-slate-950">{s.name || 'مشترك'}</p>
                <p className="text-xs font-bold text-slate-400">{s.pppoeUsername || '—'}</p>
              </div>
              <Badge color={isActiveSub(s) ? 'emerald' : 'red'}>{s.status || '—'}</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
              <div>الباقة: <b>{s.package || '—'}</b></div>
              <div>الدين: <b className={Number(s.debt || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}>{money(s.debt)} د.ع</b></div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onOpenAccounts} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white">
        فتح الحسابات <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );
}

function AccountsDrawer({ active, linkedAccounts, activeCount, expiredCount, totalDebt, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute left-0 top-0 h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">الحسابات المرتبطة</h2>
            <p className="text-xs text-slate-500">{active?.phone}</p>
          </div>
          <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black">إغلاق</button>
        </div>

        <QuickStats linkedAccounts={linkedAccounts} activeCount={activeCount} expiredCount={expiredCount} totalDebt={totalDebt} />

        <div className="mt-4 space-y-3">
          {linkedAccounts.map((sub: any) => (
            <div key={sub.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-black text-slate-900">{sub.name || '—'}</div>
                  <div className="text-xs text-slate-500">{sub.phone || active?.phone}</div>
                </div>
                <Badge color={isActiveSub(sub) ? 'emerald' : 'red'}>{sub.status || '—'}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Mini label="اليوزر" value={sub.pppoeUsername || '—'} />
                <Mini label="الباقة" value={sub.package || '—'} />
                <Mini label="الدين" value={`${money(sub.debt)} د.ع`} />
                <Mini label="المصدر" value={sub.source || 'auto'} />
              </div>

              <a href={`/subscribers/${sub.id}`} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white">
                فتح الحساب <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: any) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{label}</div><div className="font-black">{value}</div></div>;
}

function SettingsPanel({ settings, setSettings, saveSettings, saveMsg, webhookUrl }: any) {
  return (
    <div className="h-[calc(100%-4rem)] overflow-y-auto p-6">
      <div className="mb-5 flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h2 className="text-lg font-black">إعدادات Twilio WhatsApp</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['accountSid', 'Account SID'],
          ['authToken', 'Auth Token'],
          ['whatsappFrom', 'WhatsApp From'],
          ['messagingServiceSid', 'Messaging Service SID'],
        ].map(([k, label]) => (
          <label key={k} className="space-y-2">
            <span className="text-xs font-bold text-slate-600">{label}</span>
            <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings[k] || ''} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} dir="ltr" />
          </label>
        ))}

        <label className="space-y-2">
          <span className="text-xs font-bold text-slate-600">مدة نافذة المحادثة / ساعة</span>
          <input type="number" min={1} max={720} className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.conversationWindowHours || 24} onChange={(e) => setSettings({ ...settings, conversationWindowHours: Number(e.target.value || 24) })} />
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
  );
}
