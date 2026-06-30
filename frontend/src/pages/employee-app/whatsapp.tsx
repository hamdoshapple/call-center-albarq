import {
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import {
  ArrowRight,
  CheckCheck,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  MessageCircle,
  PhoneCall,
  Paperclip,
  Ticket,
  User,
  Wallet,
  RefreshCw,
  Search,
  Send,
  X,
  UserCheck,
  Users,
  Flag,
  Pin,
  PencilLine,
  Clock3,
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
  expiration?: string | null;
};

type Conv = {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  unreadCount?: number;
  conversationOpen?: boolean;
  windowExpiresAt?: string | null;
  subscriber?: SubscriberLite | null;
  subscribers?: SubscriberLite[];
  pinned?: boolean;
  priority?: 'normal' | 'medium' | 'urgent';
  claimedByName?: string;
  claimedById?: string | null;
  lastAt?: string | null;
};

type Msg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  agentName?: string;
  createdAt: string;
  status?: string;
};

type ToastType = 'error' | 'success' | 'info';

type TeamState = {
  myId: string;
  myName: string;
  claimedById?: string | null;
  claimedByName?: string;
  priority?: 'normal' | 'medium' | 'urgent';
  pinned?: boolean;
  typing?: { id: string; name: string; at: number }[];
  viewers?: { id: string; name: string; at: number }[];
};

export default function EmployeeWhatsappPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [reply, setReply] = useState('');
  const [fileData, setFileData] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; text: string } | null>(null);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const [pendingChatId, setPendingChatId] = useState<string>(() => new URLSearchParams(window.location.search).get('chat') || '');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [team, setTeam] = useState<TeamState | null>(null);

  const messagesRef = useRef<HTMLDivElement>(null!);
  const typingTimerRef = useRef<number | null>(null);
  const unreadTotal = useMemo(
    () => convs.reduce((sum, x) => sum + Number(x.unreadCount || 0), 0),
    [convs]
  );

  const canReply = Boolean(
    active?.conversationOpen ||
    (active?.windowExpiresAt && new Date(active.windowExpiresAt).getTime() > Date.now())
  );

  const windowText = useMemo(() => {
    if (!active?.windowExpiresAt) return 'بانتظار رسالة من الزبون';
    const diff = new Date(active.windowExpiresAt).getTime() - Date.now();
    if (diff <= 0) return 'انتهت نافذة الرد';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}س ${m}د متبقية`;
  }, [active?.windowExpiresAt]);

  function showToast(text: string, type: ToastType = 'error') {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 2600);
  }

  function scrollBottom(delay = 80) {
    window.setTimeout(() => {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
      setShowJumpDown(false);
    }, delay);
  }

  function playStaffNotifySound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => null);
      }, 140);
    } catch {}
  }

  function handleMessagesScroll() {
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpDown(distanceFromBottom > 180);
  }

  async function loadConvs(search = q) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('take', '30');
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/whatsapp-twilio/conversations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      const rawList: Conv[] = Array.isArray(data) ? data : data.rows || [];
      const list = [...rawList].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

      setConvs(list);
      setActive((cur) => {
        if (!cur) return null;
        const updated = list.find((x) => x.id === cur.id);
        return updated
          ? {
              ...cur,
              ...updated,
              conversationOpen: cur.conversationOpen,
              windowExpiresAt: cur.windowExpiresAt,
              subscriber: cur.subscriber,
              subscribers: cur.subscribers,
            }
          : cur;
      });
    } catch {
      showToast('تعذر تحميل المحادثات');
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/profile`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });
      if (!res.ok) return;
      const profile = await res.json();

      setActive((old) => (old && old.id === id ? { ...old, ...profile } : old));
      setConvs((old) => old.map((x) => (x.id === id ? { ...x, ...profile } : x)));
    } catch {}
  }

  async function loadMessages(id: string) {
    try {
      const data = await whatsappTwilioApi.messages(id);
      setMessages(Array.isArray(data) ? data : []);
      await whatsappTwilioApi.read(id).catch(() => null);
      setConvs((old) => old.map((x) => (x.id === id ? { ...x, unreadCount: 0 } : x)));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollBottom(0);
        });
      });
    } catch {
      showToast('تعذر تحميل الرسائل');
    }
  }

  async function openConv(conv: Conv) {
    setActive(conv);
    await loadProfile(conv.id);
    await loadTeamState(conv.id);
    await loadMessages(conv.id);
  }

  async function openChatById(id: string) {
    if (!id) return;

    if (active?.id === id) {
      await loadMessages(id);
      scrollBottom(0);
      return;
    }

    let conv = convs.find((x) => x.id === id);

    if (!conv) {
      try {
        const res = await fetch('/api/whatsapp-twilio/conversations?take=80', {
          headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || localStorage.getItem('token') || ''}` },
        });
        const data = await res.json();
        const rawList: Conv[] = Array.isArray(data) ? data : data.rows || [];
      const list = [...rawList].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
        setConvs(list);
        conv = list.find((x) => x.id === id);
      } catch {}
    }

    if (conv) {
      await openConv(conv);
      return;
    }

    const minimal: Conv = { id, phone: '', name: 'محادثة واتساب' };
    setActive(minimal);
    await loadProfile(id);
    await loadMessages(id);
  }

  async function pickFile(file?: File | null) {
    if (!file) return;
    setPreparingFile(true);

    try {
      const isImage = file.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
      const allowed =
        isImage ||
        file.type === 'application/pdf' ||
        file.type.includes('word') ||
        file.type.includes('excel') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('officedocument');

      if (!allowed) {
        showToast('نوع الملف غير مدعوم');
        return;
      }

      if (file.size > 12 * 1024 * 1024) {
        showToast('حجم الملف كبير جداً');
        return;
      }

      if (isImage) {
        const data = await compressImageToJpeg(file);
        setFileData(data);
        setFileName((file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg');
        setFileType('image/jpeg');
        showToast('تم تجهيز الصورة', 'success');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setFileData(String(reader.result || ''));
        setFileName(file.name);
        setFileType(file.type || 'application/octet-stream');
        showToast('تم تجهيز المرفق', 'success');
      };
      reader.onerror = () => showToast('تعذر قراءة الملف');
      reader.readAsDataURL(file);
    } finally {
      setPreparingFile(false);
    }
  }

  async function compressImageToJpeg(file: File): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = objectUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      });

      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS_FAILED');

      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function clearFile() {
    setFileData('');
    setFileName('');
    setFileType('');
    setFileInputKey((x) => x + 1);
  }


  async function apiPost(path: string, body?: any) {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('cc_token') || localStorage.getItem('token') || ''}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error();
    return res.json().catch(() => ({}));
  }

  async function loadTeamState(id: string) {
    try {
      const res = await fetch(`/api/whatsapp-twilio/conversations/${encodeURIComponent(id)}/team-state`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || localStorage.getItem('token') || ''}` },
      });
      if (!res.ok) return;
      setTeam(await res.json());
    } catch {}
  }

  async function claimActive() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/claim`);
    await loadTeamState(active.id);
  }

  async function unclaimActive() {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/unclaim`);
    await loadTeamState(active.id);
  }

  async function setActivePriority(priority: 'normal' | 'medium' | 'urgent') {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/priority`, { priority });
    await loadTeamState(active.id);
  }



  async function sendTyping(isTyping: boolean) {
    if (!active) return;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-typing`, { typing: isTyping }).catch(() => null);
  }

  async function togglePinActive() {
    if (!active) return;
    const next = !team?.pinned;
    await apiPost(`/api/whatsapp-twilio/conversations/${active.id}/pin`, { pinned: next });
    await loadTeamState(active.id);
  }




  function handleReplyChange(v: string) {
    setReply(v);

    if (!active) return;

    localStorage.setItem(`wa_draft_${active.id}`, v);

    sendTyping(Boolean(v.trim())).catch(() => null);

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      sendTyping(false).catch(() => null);
    }, 3500);
  }


  async function sendReply() {
    const text = reply.trim();
    if (!active || (!text && !fileData)) return;

    if (!canReply) {
      showToast('انتهت نافذة الرد');
      return;
    }

    setSending(true);
    try {
      const msg = await whatsappTwilioApi.reply(
        active.id,
        text,
        fileData || undefined,
        fileName || undefined,
        fileType || undefined
      );

      setMessages((old) => [...old, msg]);
      setReply('');
      if (active) localStorage.removeItem(`wa_draft_${active.id}`);
      await sendTyping(false).catch(() => null);
      clearFile();
      await loadConvs(q);
      scrollBottom();
    } catch (e: any) {
      showToast('تعذر إرسال الرسالة أو المحادثة مستلمة من موظف آخر');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (active) {
      setReply(localStorage.getItem(`wa_draft_${active.id}`) || '');
    }
  }, [active?.id]);

  useEffect(() => {
    if (!active || !messages.length) return;

    requestAnimationFrame(() => {
      scrollBottom(0);
    });
  }, [messages.length, active?.id]);

  useEffect(() => {
    loadConvs('');
    const t = window.setInterval(() => loadConvs(q), 12000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const n: any = navigator as any;
    if (n.setAppBadge) {
      if (unreadTotal > 0) n.setAppBadge(unreadTotal).catch(() => null);
      else n.clearAppBadge?.().catch(() => null);
    }
  }, [unreadTotal]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'WA_OPEN_CHAT') {
        const cid = event.data?.payload?.conversationId;
        if (cid) setPendingChatId(cid);
        return;
      }

      if (event.data?.type !== 'WA_PUSH_MESSAGE') return;
      playStaffNotifySound();
      loadConvs(q);

      const cid = event.data?.payload?.conversationId;
      if (cid && active?.id === cid) {
        loadMessages(cid);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [active?.id, q]);

  useEffect(() => {
    const chatFromUrl = pendingChatId || new URLSearchParams(window.location.search).get('chat') || '';
    if (!chatFromUrl) return;

    openChatById(chatFromUrl);
    setPendingChatId('');
    window.history.replaceState({}, '', '/employee/whatsapp');
  }, [pendingChatId, convs.length]);

  useEffect(() => {
    if (active) setReply(localStorage.getItem(`wa_draft_${active.id}`) || '');
  }, [active?.id]);

  useEffect(() => {
    if (!active) return;

    loadTeamState(active.id);
    apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-presence`).catch(() => null);

    const t = window.setInterval(() => {
      apiPost(`/api/whatsapp-twilio/conversations/${active.id}/team-presence`).catch(() => null);
      loadTeamState(active.id);
    }, 15000);

    return () => window.clearInterval(t);
  }, [active?.id]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('employee-wa-chat-open', { detail: Boolean(active) }));
    return () => {
      window.dispatchEvent(new CustomEvent('employee-wa-chat-open', { detail: false }));
    };
  }, [active]);

  return (
    <section dir="rtl" className="h-screen overflow-hidden bg-[#f6f8fb] flex flex-col">
      {toast ? <Toast toast={toast} /> : null}

      {!active ? (
        <ConversationList
          convs={convs}
          q={q}
          setQ={setQ}
          loading={loading}
          unreadTotal={unreadTotal}
          onRefresh={() => loadConvs(q)}
          onOpen={openConv}
        />
      ) : (
        <ChatScreen
          active={active}
          messages={messages}
          messagesRef={messagesRef}
          showJumpDown={showJumpDown}
          onMessagesScroll={handleMessagesScroll}
          onJumpDown={() => scrollBottom(0)}
          canReply={canReply && (!team?.claimedById || team.claimedById === team.myId)}
          team={team}
          onClaim={claimActive}
          onUnclaim={unclaimActive}
          onPriority={setActivePriority}
          onTogglePin={togglePinActive}
          windowText={windowText}
          reply={reply}
          setReply={handleReplyChange}
          fileData={fileData}
          fileName={fileName}
          fileType={fileType}
          fileInputKey={fileInputKey}
          sending={sending}
          preparingFile={preparingFile}
          onBack={() => setActive(null)}
          onOpenCustomer={() => setCustomerModalOpen(true)}
          onPickFile={pickFile}
          onClearFile={clearFile}
          onSend={sendReply}
          onFocus={() => scrollBottom(250)}
        />
      )}

      {active && customerModalOpen ? (
        <CustomerModal conv={active} onClose={() => setCustomerModalOpen(false)} />
      ) : null}
    </section>
  );
}



function ConversationList({
  convs,
  q,
  setQ,
  loading,
  unreadTotal,
  onRefresh,
  onOpen,
}: {
  convs: Conv[];
  q: string;
  setQ: (v: string) => void;
  loading: boolean;
  unreadTotal: number;
  onRefresh: () => void;
  onOpen: (c: Conv) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread' | 'unclaimed' | 'claimed' | 'pinned'>('all');

  const sorted = [...convs].sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pin) return pin;
    const unread = Number(b.unreadCount || 0) - Number(a.unreadCount || 0);
    if (unread) return unread;
    return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
  });

  const filtered = sorted.filter((conv) => {
    if (filter === 'pinned') return Boolean(conv.pinned);
    if (filter === 'claimed') return Boolean(conv.claimedByName || conv.claimedById);
    if (filter === 'unread') return Number(conv.unreadCount || 0) > 0;
    if (filter === 'unclaimed') return !conv.claimedByName && !conv.claimedById;
    return true;
  });

  const pinned = filtered.filter((x) => x.pinned);
  const normal = filtered.filter((x) => !x.pinned);

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pt-[calc(env(safe-area-inset-top)+18px)] pb-24">
      <Header unreadTotal={unreadTotal} loading={loading} onRefresh={onRefresh} />

      <div className="mt-4 flex items-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onRefresh()}
          className="min-w-0 w-full bg-transparent text-sm font-black outline-none placeholder:text-slate-400"
          placeholder="بحث بالمحادثات أو رقم الهاتف..."
        />
      </div>

      
<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
  <FilterChip active={filter==='all'} label="الكل" onClick={()=>setFilter('all')} />
  <FilterChip active={filter==='unread'} label="غير المقروءة" onClick={()=>setFilter('unread')} />
  <FilterChip active={filter==='unclaimed'} label="غير مستلمة" onClick={()=>setFilter('unclaimed')} />
  <FilterChip active={filter==='claimed'} label="مستلمة" onClick={()=>setFilter('claimed')} />
  <FilterChip active={filter==='pinned'} label="مثبتة" onClick={()=>setFilter('pinned')} />
</div>



      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
        {pinned.length ? (
          <ConversationSection title={`المحادثات المثبتة (${pinned.length})`} pinned>
            {pinned.map((conv) => <ConversationCard key={conv.id} conv={conv} onOpen={onOpen} />)}
          </ConversationSection>
        ) : null}

        <ConversationSection title={pinned.length ? 'كل المحادثات' : 'المحادثات'}>
          {normal.map((conv) => <ConversationCard key={conv.id} conv={conv} onOpen={onOpen} />)}
        </ConversationSection>

        {!loading && !filtered.length ? (
          <div className="mt-6 rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
            <MessageCircle className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-4 text-lg font-black text-slate-950">لا توجد محادثات</h2>
            <p className="mt-2 text-sm font-bold text-slate-400">لا توجد نتائج ضمن هذا الفلتر</p>
          </div>
        ) : null}
      </div>
</div>
  );
}


function FilterChip({
  active,
  label,
  onClick,
}:{
  active:boolean;
  label:string;
  onClick:()=>void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black transition ${
        active
          ? 'bg-emerald-500 text-white'
          : 'border border-slate-200 bg-white text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}


function ConversationSection({ title, pinned, children }: { title: string; pinned?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className={`mb-2 flex items-center justify-between rounded-2xl border px-4 py-3 ${
        pinned ? 'border-amber-200 bg-amber-50/70 text-slate-950' : 'border-slate-100 bg-white/75 text-slate-800'
      }`}>
        <div className="flex items-center gap-2 text-sm font-black">
          {pinned ? <Pin className="h-4 w-4 text-amber-500" /> : <MessageCircle className="h-4 w-4 text-slate-400" />}
          <span>{title}</span>
        </div>
        <span className="text-slate-400">⌃</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ConversationCard({ conv, onOpen }: { conv: Conv; onOpen: (c: Conv) => void }) {
  const accounts = conv.subscribers?.length ? conv.subscribers : conv.subscriber ? [conv.subscriber] : [];
  const hasDebt = accounts.some((x) => Number(x.debt || 0) > 0);
  const isActive = accounts.length
    ? accounts.some((x) => String(x.status || '').toLowerCase().includes('active') || String(x.status || '').includes('فعال'))
    : false;

  const unread = Number(conv.unreadCount || 0);
  const lastTime = formatConversationTime(conv.lastAt || '');

  async function quickConvAction(action: 'pin' | 'claim' | 'urgent' | 'normal') {
    try {
      const token = localStorage.getItem('cc_token') || localStorage.getItem('token') || '';
      if (action === 'pin') {
        await fetch(`/api/whatsapp-twilio/conversations/${conv.id}/pin`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: !conv.pinned }),
        });
      }

      if (action === 'claim') {
        await fetch(`/api/whatsapp-twilio/conversations/${conv.id}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'urgent' || action === 'normal') {
        await fetch(`/api/whatsapp-twilio/conversations/${conv.id}/priority`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: action === 'urgent' ? 'urgent' : 'normal' }),
        });
      }

      window.location.reload();
    } catch {}
  }

  const priorityLabel =
    conv.priority === 'urgent' ? 'مستعجلة' :
    conv.priority === 'medium' ? 'متوسطة' :
    '';

  return (
    <div className="group relative overflow-hidden rounded-[1.65rem]">
      <div className="absolute inset-y-0 right-0 flex items-center gap-2 px-3">
        <button onClick={() => quickConvAction('pin')} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Pin className="h-4 w-4" />
        </button>
        <button onClick={() => quickConvAction('urgent')} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute inset-y-0 left-0 flex items-center gap-2 px-3">
        <button onClick={() => quickConvAction('claim')} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <UserCheck className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={() => onOpen(conv)}
        className="relative z-10 flex w-full gap-3 rounded-[1.65rem] border border-slate-100 bg-white p-4 text-right shadow-lg shadow-slate-200/70 transition-transform duration-200 active:scale-[0.99] group-hover:-translate-x-14"
      >
      {conv.pinned ? (
        <div className="absolute right-0 top-0 h-14 w-14 bg-amber-400 [clip-path:polygon(100%_0,0_0,100%_100%)]">
          <Pin className="absolute right-2 top-2 h-4 w-4 text-white" />
        </div>
      ) : null}

      
<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
  <MessageCircle className="h-6 w-6" />
</div>


      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-black text-slate-950">{conv.name || conv.phone}</h3>
            <p className="mt-1 truncate text-xs font-bold text-slate-400">{conv.lastMessage || 'مرفق'}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {lastTime ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-400">
                <Clock3 className="h-3 w-3" />
                {lastTime}
              </span>
            ) : null}

            {unread ? (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-md shadow-red-100">
                {unread}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isActive ? <MiniBadge color="green" label="عميل نشط" /> : null}
          {hasDebt ? <MiniBadge color="orange" label="عليه ديون" /> : null}

          {conv.claimedByName ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
              <UserCheck className="h-3 w-3" />
              مستلمة: {conv.claimedByName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-400">
              <UserCheck className="h-3 w-3" />
              غير مستلمة
            </span>
          )}

          {priorityLabel ? (
            <span className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black ${
              conv.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}>
              <Flag className="h-3 w-3" />
              {priorityLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-3 left-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
        <MessageCircle className="h-5 w-5" />
      </div>
      </button>
    </div>
  );
}

function MiniBadge({ color, label }: { color: 'green' | 'orange'; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black ${
      color === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-600'
    }`}>
      <span className={`h-2 w-2 rounded-full ${color === 'green' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
      {label}
    </span>
  );
}


function formatConversationTime(v: string) {
  if (!v) return '';
  try {
    const d = new Date(v);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return new Intl.DateTimeFormat('ar-IQ', { hour: '2-digit', minute: '2-digit' }).format(d);
    }
    const diff = now.getTime() - d.getTime();
    if (diff < 7 * 86400000) return new Intl.DateTimeFormat('ar-IQ', { weekday: 'short' }).format(d);
    return new Intl.DateTimeFormat('ar-IQ', { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return '';
  }
}



function ChatScreen({
  active,
  messages,
  messagesRef,
  showJumpDown,
  onMessagesScroll,
  onJumpDown,
  canReply,
  team,
  onClaim,
  onUnclaim,
  onPriority,
  onTogglePin,
  windowText,
  reply,
  setReply,
  fileData,
  fileName,
  fileType,
  fileInputKey,
  sending,
  preparingFile,
  onBack,
  onOpenCustomer,
  onPickFile,
  onClearFile,
  onSend,
  onFocus,
}: {
  active: Conv;
  messages: Msg[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  showJumpDown: boolean;
  onMessagesScroll: () => void;
  onJumpDown: () => void;
  canReply: boolean;
  team: TeamState | null;
  onClaim: () => void;
  onUnclaim: () => void;
  onPriority: (p: 'normal' | 'medium' | 'urgent') => void;
  onTogglePin: () => void;
  windowText: string;
  reply: string;
  setReply: (v: string) => void;
  fileData: string;
  fileName: string;
  fileType: string;
  fileInputKey: number;
  sending: boolean;
  preparingFile: boolean;
  onBack: () => void;
  onOpenCustomer: () => void;
  onPickFile: (file?: File | null) => void;
  onClearFile: () => void;
  onSend: () => void;
  onFocus: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md h-full flex flex-col px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+8px)]">
      <div className="shrink-0">
        <ChatHeader active={active} onBack={onBack} onOpenCustomer={onOpenCustomer} />
        <ReplyWindowBanner canReply={canReply} text={windowText} />
        <TeamBar team={team} onClaim={onClaim} onUnclaim={onUnclaim} onPriority={onPriority} onTogglePin={onTogglePin} />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={messagesRef} onScroll={onMessagesScroll} className="h-full min-h-0 space-y-2 overflow-y-auto px-1 pb-4 pt-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {showJumpDown ? (
        <button
          onClick={onJumpDown}
          className="absolute bottom-4 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-white text-sky-500 shadow-xl shadow-slate-300/60"
          aria-label="النزول لآخر المحادثة"
        >
          ↓
        </button>
      ) : null}
    </div>

      <div className="shrink-0 space-y-2">
        {fileData ? (
          <AttachmentPreview fileData={fileData} fileName={fileName} fileType={fileType} onClear={onClearFile} />
        ) : null}

        <Composer
          canReply={canReply && (!team?.claimedById || team.claimedById === team.myId)}
          reply={reply}
          setReply={setReply}
          fileInputKey={fileInputKey}
          fileData={fileData}
          sending={sending}
          preparingFile={preparingFile}
          onPickFile={onPickFile}
          onSend={onSend}
          onFocus={onFocus}
        />
      </div>
    </div>
  );
}


function TeamBar({
  team,
  onClaim,
  onUnclaim,
  onPriority,
  onTogglePin,
}: {
  team: TeamState | null;
  onClaim: () => void;
  onUnclaim: () => void;
  onPriority: (p: 'normal' | 'medium' | 'urgent') => void;
  onTogglePin: () => void;
}) {
  const mine = team?.claimedById && team.claimedById === team.myId;
  const claimed = Boolean(team?.claimedById);
  const viewers = (team?.viewers || []).filter((v) => v.id !== team?.myId);
  const typing = (team?.typing || []).filter((v) => v.id !== team?.myId);

  return (
    <div className="mt-2 rounded-[1.2rem] border border-white/80 bg-white/85 p-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px] font-black text-slate-700">
            <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>{claimed ? `مستلمة بواسطة ${team?.claimedByName}` : 'غير مستلمة'}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-400">
            {typing.length ? <PencilLine className="h-3 w-3 shrink-0 text-emerald-500" /> : <Users className="h-3 w-3 shrink-0" />}
            <span className="truncate">
              {typing.length
                ? `${typing.map((x) => x.name).join('، ')} يكتب الآن...`
                : viewers.length
                  ? `يشاهدها: ${viewers.map((x) => x.name).join('، ')}`
                  : 'لا يوجد موظف آخر يشاهدها الآن'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onTogglePin} className={`flex h-9 w-9 items-center justify-center rounded-xl ${team?.pinned ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            <Pin className="h-3.5 w-3.5" />
          </button>

          {mine ? (
            <button onClick={onUnclaim} className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-600">
              ترك
            </button>
          ) : (
            <button onClick={onClaim} className="rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-white">
              استلام
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button onClick={() => onPriority('normal')} className={`rounded-xl py-1.5 text-[10px] font-black ${team?.priority === 'normal' || !team?.priority ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}><Flag className='inline h-3 w-3 ml-1'/>عادي</button>
        <button onClick={() => onPriority('medium')} className={`rounded-xl py-1.5 text-[10px] font-black ${team?.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'}`}><Flag className='inline h-3 w-3 ml-1'/>متوسط</button>
        <button onClick={() => onPriority('urgent')} className={`rounded-xl py-1.5 text-[10px] font-black ${team?.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-400'}`}><Flag className='inline h-3 w-3 ml-1'/>مستعجل</button>
      </div>
    </div>
  );
}


function ChatHeader({ active, onBack, onOpenCustomer }: { active: Conv; onBack: () => void; onOpenCustomer: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-[1.35rem] border border-white/70 bg-white/90 p-2.5 shadow-lg shadow-slate-200/70 backdrop-blur-xl">
      <button onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors">
        <ArrowRight className="h-5 w-5" />
      </button>

      <button onClick={onOpenCustomer} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 active:scale-95 transition">
        <MessageCircle className="h-6 w-6" />
      </button>

      <button onClick={onOpenCustomer} className="min-w-0 flex-1 text-right active:opacity-80">
        <h1 className="truncate text-[15px] font-black text-slate-950">{active.name || active.phone}</h1>
        <p className="truncate text-[11px] font-bold text-slate-400">{active.phone}</p>
      </button>
    </div>
  );
}


function CustomerModal({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  const accounts = conv.subscribers?.length ? conv.subscribers : conv.subscriber ? [conv.subscriber] : [];
  const totalDebt = accounts.reduce((sum, x) => sum + Number(x.debt || 0), 0);
  const activeAccounts = accounts.filter((x) => String(x.status || '').toLowerCase().includes('active') || String(x.status || '').includes('فعال')).length;

  const [calls, setCalls] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadExtra() {
      setLoadingExtra(true);
      const token = localStorage.getItem('cc_token') || '';
      const phone = encodeURIComponent(conv.phone || '');

      try {
        const [callsRes, ticketsRes] = await Promise.allSettled([
          fetch(`/api/call-logs?phone=${phone}&take=5`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
          fetch(`/api/admin-tickets?phone=${phone}&take=5`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : []),
        ]);

        if (!alive) return;

        const c: any = callsRes.status === 'fulfilled' ? callsRes.value : [];
        const t: any = ticketsRes.status === 'fulfilled' ? ticketsRes.value : [];

        setCalls(Array.isArray(c) ? c : c.rows || c.data || []);
        setTickets(Array.isArray(t) ? t : t.rows || t.data || []);
      } finally {
        if (alive) setLoadingExtra(false);
      }
    }

    loadExtra();
    return () => { alive = false; };
  }, [conv.id, conv.phone]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/35 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] backdrop-blur-sm">
      <div className="relative max-h-[88dvh] w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
            <X className="h-5 w-5" />
          </button>

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
            <User className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black text-slate-950">{conv.name || accounts[0]?.name || conv.phone}</h2>
            <p className="truncate text-xs font-bold text-slate-400">{conv.phone}</p>
          </div>
        </div>

        <div className="max-h-[calc(88dvh-86px)] space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat title="الحسابات" value={String(accounts.length || 0)} />
            <MiniStat title="الفعالة" value={String(activeAccounts)} />
            <MiniStat title="الديون" value={formatMoney(totalDebt)} />
          </div>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
              <Wallet className="h-4 w-4 text-sky-500" />
              حسابات المشترك
            </div>

            <div className="space-y-2">
              {accounts.length ? accounts.map((acc, i) => (
                <div key={`${acc.id}-${i}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-black text-slate-950">{acc.name || 'مشترك'}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">{acc.status || 'غير محدد'}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500">
                    <Info label="يوزر" value={acc.pppoeUsername || '-'} />
                    <Info label="الباقة" value={acc.package || '-'} />
                    <Info label="الدين" value={formatMoney(Number(acc.debt || 0))} />
                    <Info label="الانتهاء" value={acc.expiration ? formatDate(acc.expiration) : '-'} />
                  </div>
                </div>
              )) : (
                <EmptyBox text="لا توجد حسابات مربوطة بهذا الرقم" />
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
              <PhoneCall className="h-4 w-4 text-sky-500" />
              آخر المكالمات
              {loadingExtra ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
            </div>

            <div className="space-y-2">
              {calls.length ? calls.slice(0, 5).map((c, i) => (
                <div key={c.id || i} className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                  <div className="flex justify-between gap-2">
                    <span>{c.direction || c.type || 'مكالمة'}</span>
                    <span>{formatDate(c.createdAt || c.startTime || c.date)}</span>
                  </div>
                  <p className="mt-1 truncate text-slate-400">{c.agentName || c.agent || c.from || c.to || 'لا توجد تفاصيل'}</p>
                </div>
              )) : (
                <EmptyBox text="لا توجد مكالمات ظاهرة حالياً" />
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
              <Ticket className="h-4 w-4 text-sky-500" />
              التذاكر التابعة
            </div>

            <div className="space-y-2">
              {tickets.length ? tickets.slice(0, 5).map((t, i) => (
                <button
                  key={t.id || i}
                  onClick={() => setSelectedTicket(t)}
                  className="w-full rounded-2xl bg-slate-50 p-3 text-right transition active:scale-[0.99]"
                >
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-xs font-black text-slate-800">{t.title || t.subject || t.problem || 'تذكرة'}</p>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{t.status || 'مفتوحة'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] font-bold text-slate-400">{t.description || t.notes || t.lastMessage || ''}</p>
                </button>
              )) : (
                <EmptyBox text="لا توجد تذاكر مرتبطة حالياً" />
              )}
            </div>
          </section>
        </div>

        {selectedTicket ? (
          <div className="absolute inset-0 z-10 flex items-end bg-slate-950/25 backdrop-blur-sm">
            <div className="max-h-[72%] w-full overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <button onClick={() => setSelectedTicket(null)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                  <X className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-sky-500">تفاصيل التذكرة</p>
                  <h3 className="truncate text-lg font-black text-slate-950">
                    {selectedTicket.title || selectedTicket.subject || selectedTicket.problem || 'تذكرة'}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-500">
                  {selectedTicket.status || 'مفتوحة'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Info label="رقم التذكرة" value={String(selectedTicket.id || selectedTicket.ticketId || '-')} />
                <Info label="الأولوية" value={String(selectedTicket.priority || selectedTicket.level || '-')} />
                <Info label="القسم" value={String(selectedTicket.department || selectedTicket.category || '-')} />
                <Info label="الموظف" value={String(selectedTicket.agentName || selectedTicket.assignedTo || selectedTicket.employee || '-')} />
                <Info label="تاريخ الإنشاء" value={formatDate(selectedTicket.createdAt || selectedTicket.date)} />
                <Info label="آخر تحديث" value={formatDate(selectedTicket.updatedAt || selectedTicket.lastUpdate)} />
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="mb-1 text-xs font-black text-slate-400">الوصف</p>
                <p className="whitespace-pre-wrap text-sm font-bold leading-7 text-slate-700">
                  {selectedTicket.description || selectedTicket.notes || selectedTicket.lastMessage || selectedTicket.details || 'لا توجد تفاصيل مكتوبة'}
                </p>
              </div>

              {(selectedTicket.comments || selectedTicket.logs || selectedTicket.history) ? (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black text-slate-400">الملاحظات / السجل</p>
                  {(Array.isArray(selectedTicket.comments) ? selectedTicket.comments : Array.isArray(selectedTicket.logs) ? selectedTicket.logs : Array.isArray(selectedTicket.history) ? selectedTicket.history : []).slice(0, 8).map((x: any, i: number) => (
                    <div key={i} className="border-b border-white py-2 last:border-0">
                      <p className="text-xs font-black text-slate-700">{x.author || x.user || x.employee || 'ملاحظة'}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">{x.body || x.text || x.note || x.description || ''}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-3 text-center">
      <p className="text-base font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[10px] font-black text-slate-400">{title}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-2 py-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="truncate text-[11px] text-slate-700">{value}</p>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">{text}</div>;
}

function formatMoney(v: number) {
  if (!v) return '0';
  return new Intl.NumberFormat('ar-IQ').format(v);
}

function formatDate(v: any) {
  if (!v) return '-';
  try {
    return new Intl.DateTimeFormat('ar-IQ', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
  } catch {
    return String(v);
  }
}


function ReplyWindowBanner({ canReply, text }: { canReply: boolean; text: string }) {
  return (
    <div
      className={`mt-2 flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold shadow-lg ${
        canReply ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
      }`}
    >
      <Grid3X3 className="h-3 w-3 shrink-0" />
      <span className="truncate">{canReply ? `نافذة الرد مفتوحة • ${text}` : 'انتهت نافذة الرد'}</span>
    </div>
  );
}

function Composer({
  canReply,
  reply,
  setReply,
  fileInputKey,
  fileData,
  sending,
  preparingFile,
  onPickFile,
  onSend,
  onFocus,
}: {
  canReply: boolean;
  reply: string;
  setReply: (v: string) => void;
  fileInputKey: number;
  fileData: string;
  sending: boolean;
  preparingFile: boolean;
  onPickFile: (file?: File | null) => void;
  onSend: () => void;
  onFocus: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[2rem] border border-white/80 bg-white/95 p-2 shadow-2xl shadow-slate-300/50 backdrop-blur-xl">
      <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-slate-50 text-emerald-500 hover:bg-emerald-50 transition-colors">
        <Paperclip className="h-5 w-5" />
        <input
          key={`file-${fileInputKey}`}
          type="file"
          accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />
      </label>

      <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-slate-50 text-emerald-500 hover:bg-emerald-50 transition-colors">
        <ImageIcon className="h-5 w-5" />
        <input
          key={`img-${fileInputKey}`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />
      </label>

      <input
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        disabled={!canReply}
        className="min-h-12 min-w-0 flex-1 rounded-full bg-slate-100 px-5 text-sm font-semibold outline-none placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
        placeholder={canReply ? 'اكتب رسالة' : 'نافذة الرد مغلقة'}
      />

      <button
        onClick={onSend}
        disabled={!canReply || sending || preparingFile || (!reply.trim() && !fileData)}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending || preparingFile ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
      </button>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const outbound = msg.direction === 'outbound';
  const type = String(msg.mediaType || '');
  const isImage = Boolean(msg.mediaUrl) && type.startsWith('image');
  const isPdf = Boolean(msg.mediaUrl) && type.includes('pdf');

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'} px-1`}>
      <div
        className={`max-w-[82%] overflow-hidden rounded-[1.35rem] shadow-sm ${
          outbound ? 'bg-emerald-100 text-emerald-800 rounded-br-md border border-emerald-200' : 'bg-white text-slate-950 rounded-bl-md border border-slate-100'
        }`}
      >
        {msg.mediaUrl ? (
          isImage ? (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block">
              <img src={msg.mediaUrl} alt="مرفق" className="max-h-64 w-full object-cover" loading="lazy" />
            </a>
          ) : (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 pt-3 pb-1 text-sm font-black underline hover:opacity-80">
              {isPdf ? <FileText className="h-4 w-4 shrink-0" /> : <Paperclip className="h-4 w-4 shrink-0" />}
              فتح المرفق
            </a>
          )
        ) : null}

        {msg.body ? <p className="whitespace-pre-wrap px-3.5 py-2.5 text-[15px] font-semibold leading-7">{msg.body}</p> : null}

        <div className={`px-3 pb-2 flex items-end justify-between gap-2 ${outbound ? 'text-emerald-600' : 'text-slate-400'}`}>
          {outbound && msg.agentName ? (
            <div className="max-w-[120px] truncate text-[8px] leading-none opacity-70">{msg.agentName}</div>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-1 text-[10px] leading-none shrink-0">
            <span>{formatTime(msg.createdAt)}</span>
            {outbound ? <MessageStatusTicks status={msg.status} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}


function MessageStatusTicks({ status }: { status?: string }) {
  const s = String(status || '').toLowerCase();

  if (s === 'failed' || s === 'undelivered') {
    return <span className="text-[11px] font-black text-red-200">!</span>;
  }

  if (s === 'read') {
    return (
      <span className="relative inline-flex h-3.5 w-5 items-center text-blue-300">
        <CheckCheck className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (s === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 opacity-75" />;
  }

  return (
    <span className="relative inline-flex h-3.5 w-3.5 items-center opacity-75">
      <CheckCheck className="h-3.5 w-3.5" />
      <span className="absolute left-0 top-0 h-full w-1.5 bg-[#21a8e8]" />
    </span>
  );
}


function AttachmentPreview({
  fileData,
  fileName,
  fileType,
  onClear,
}: {
  fileData: string;
  fileName: string;
  fileType: string;
  onClear: () => void;
}) {
  const isImage = fileType.startsWith('image/');
  const isPdf = fileType.includes('pdf');

  return (
    <div className="rounded-[1.4rem] bg-white p-3 shadow-lg shadow-slate-200/70">
      <div className="flex gap-3 items-center">
        <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 text-sky-500">
          {isImage ? <img src={fileData} alt="معاينة" className="h-full w-full object-cover" /> : isPdf ? <FileText className="h-8 w-8" /> : <Paperclip className="h-8 w-8" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-950">{fileName || 'مرفق'}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">جاهز للإرسال</p>
        </div>

        <button onClick={onClear} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function Header({ unreadTotal, loading, onRefresh }: { unreadTotal: number; loading: boolean; onRefresh: () => void }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-sky-500">WhatsApp Webhook</p>
        <h1 className="text-3xl font-black text-slate-950">واتساب</h1>
        <p className="mt-1 text-xs font-bold text-slate-400">الرسائل الواردة من العملاء</p>
      </div>

      <button onClick={onRefresh} className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-lg shadow-slate-200 hover:shadow-xl transition-shadow">
        <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        {unreadTotal ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm">
            {unreadTotal}
          </span>
        ) : null}
      </button>
    </header>
  );
}

function Toast({ toast }: { toast: { type: ToastType; text: string } }) {
  return (
    <div
      className={`fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-[80] w-fit max-w-[90%] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm font-black shadow-xl ${
        toast.type === 'success'
          ? 'bg-emerald-50 text-emerald-600'
          : toast.type === 'info'
            ? 'bg-sky-50 text-sky-600'
            : 'bg-red-50 text-red-500'
      }`}
    >
      {toast.text}
    </div>
  );
}

function formatTime(v: string) {
  if (!v) return '';
  try {
    return new Intl.DateTimeFormat('ar-IQ', { hour: '2-digit', minute: '2-digit' }).format(new Date(v));
  } catch {
    return '';
  }
}
