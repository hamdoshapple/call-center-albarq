import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Settings, Save, MessageCircle, CheckCircle2, Search, User, ExternalLink } from 'lucide-react';
import { whatsappTwilioApi } from '@/api/whatsappTwilio';

type SubscriberLite = {
  id: string;
  name?: string;
  phone?: string;
  pppoeUsername?: string;
  package?: string;
  status?: string;
  source?: string;
};

type Conv = {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  lastAt?: string;
  unreadCount: number;
  subscriber?: SubscriberLite | null;
};

type Msg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  status: string;
  createdAt: string;
};

export default function WhatsappInboxPage() {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [settings, setSettings] = useState<any>({});
  const [saveMsg, setSaveMsg] = useState('');

  async function loadConvs(search = q) {
    setErr('');
    setLoading(true);
    try {
      const path = search.trim()
        ? `/whatsapp-twilio/conversations?q=${encodeURIComponent(search.trim())}`
        : '/whatsapp-twilio/conversations';

      const res = await fetch(`/api${path}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });
      if (!res.ok) throw new Error('LOAD_FAILED');
      const data = await res.json();
      setConvs(data);
      if (!active && data[0]) setActive(data[0]);
      if (active) {
        const updated = data.find((x: Conv) => x.id === active.id);
        if (updated) setActive(updated);
      }
    } catch {
      setErr('فشل تحميل المحادثات');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(id: string) {
    setErr('');
    try {
      const data = await whatsappTwilioApi.messages(id);
      setMessages(data);
      await whatsappTwilioApi.read(id).catch(() => null);
      setConvs((old: Conv[]) => old.map((x) => x.id === id ? { ...x, unreadCount: 0 } : x));
    } catch {
      setErr('فشل تحميل الرسائل');
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!active || !text) return;
    setSending(true);
    setErr('');
    try {
      const msg = await whatsappTwilioApi.reply(active.id, text);
      setMessages((old: Msg[]) => [...old, msg]);
      setReply('');
      await loadConvs();
    } catch {
      setErr('فشل الإرسال. تأكد من إعدادات Twilio ونافذة واتساب.');
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

  useEffect(() => { loadConvs(); loadSettings().catch(() => null); }, []);
  useEffect(() => { if (active?.id) loadMessages(active.id); }, [active?.id]);

  const webhookUrl = useMemo(() => settings?.webhookUrl || '', [settings]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">صندوق واتساب Twilio</h1>
          <p className="text-sm text-slate-500">محادثات واتساب مربوطة بمشتركي البرق Live/Cache</p>
        </div>
        <div className="flex gap-2 rounded-2xl bg-white p-1 shadow-sm">
          <button onClick={() => setTab('inbox')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'inbox' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>المحادثات</button>
          <button onClick={() => setTab('settings')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'settings' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>الإعدادات</button>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{err}</div>}

      {tab === 'settings' ? (
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h2 className="text-lg font-black">إعدادات Twilio WhatsApp</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600">Account SID</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.accountSid || ''} onChange={(e) => setSettings({ ...settings, accountSid: e.target.value })} placeholder="ACxxxxxxxxxxxxxxxx" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600">Auth Token</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.authToken || ''} onChange={(e) => setSettings({ ...settings, authToken: e.target.value })} placeholder={settings.authTokenMasked || 'ضع التوكن هنا'} />
              <p className="text-xs text-slate-400">اتركه فارغ إذا ما تريد تغييره.</p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600">WhatsApp From</span>
              <input className="w-full rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" value={settings.whatsappFrom || ''} onChange={(e) => setSettings({ ...settings, whatsappFrom: e.target.value })} placeholder="+14155238886" />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border p-4">
              <input type="checkbox" checked={!!settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              <span className="font-bold">تفعيل الإرسال عبر Twilio</span>
            </label>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-600">Webhook URL داخل Twilio</div>
            <code className="mt-2 block break-all rounded-xl bg-white p-3 text-left text-xs">{webhookUrl}</code>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={saveSettings} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              <Save className="h-4 w-4" /> حفظ
            </button>
            {saveMsg && <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700"><CheckCircle2 className="h-4 w-4" /> {saveMsg}</span>}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[650px] gap-4 lg:grid-cols-[390px_1fr]">
          <div className="rounded-3xl bg-white shadow-sm">
            <div className="border-b p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-black">المحادثات</div>
                <button onClick={() => loadConvs()} className="rounded-xl p-2 hover:bg-slate-100">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); loadConvs(e.target.value); }}
                  placeholder="بحث: اسم، رقم، يوزر، باقة..."
                  className="w-full rounded-2xl border py-2.5 pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="max-h-[590px] overflow-auto p-2">
              {convs.length === 0 && <div className="p-8 text-center text-sm text-slate-400">ماكو نتائج</div>}
              {convs.map((c) => {
                const title = c.subscriber?.name || c.name || c.phone;
                return (
                  <button key={c.id} onClick={() => setActive(c)} className={`mb-2 w-full rounded-2xl p-3 text-right transition ${active?.id === c.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="line-clamp-1 font-black">{title}</div>
                      {c.unreadCount > 0 && <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-black text-white">{c.unreadCount}</span>}
                    </div>
                    <div className={`mt-1 text-xs ${active?.id === c.id ? 'text-slate-200' : 'text-slate-500'}`}>
                      {c.phone}
                      {c.subscriber?.pppoeUsername ? ` • ${c.subscriber.pppoeUsername}` : ''}
                    </div>
                    <div className={`mt-1 line-clamp-1 text-xs ${active?.id === c.id ? 'text-slate-300' : 'text-slate-500'}`}>{c.lastMessage || '—'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex rounded-3xl bg-white shadow-sm">
            {!active ? (
              <div className="m-auto text-center text-slate-400">
                <MessageCircle className="mx-auto mb-3 h-12 w-12" />
                اختر محادثة
              </div>
            ) : (
              <div className="flex w-full flex-col">
                <div className="border-b p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black">{active.subscriber?.name || active.name || active.phone}</div>
                      <div className="text-xs text-slate-400">{active.phone}</div>
                    </div>
                    {active.subscriber ? (
                      <div className="rounded-2xl bg-green-50 p-3 text-sm">
                        <div className="flex items-center gap-2 font-black text-green-800"><User className="h-4 w-4" /> مرتبط بمشترك</div>
                        <div className="mt-1 text-green-700">
                          {active.subscriber.pppoeUsername || 'بدون يوزر'} • {active.subscriber.package || '—'} • {active.subscriber.source}
                        </div>
                        <a href={`/subscribers/${active.subscriber.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-black text-green-900">
                          فتح ملف المشترك <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">
                        غير مرتبط بمشترك
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-auto bg-slate-50 p-4">
                  {messages.map((m) => {
                    const out = m.direction === 'outbound';
                    return (
                      <div key={m.id} className={`flex ${out ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[75%] rounded-3xl px-4 py-3 text-sm shadow-sm ${out ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
                          <div className="whitespace-pre-wrap">{m.body}</div>
                          <div className={`mt-2 text-[10px] ${out ? 'text-slate-300' : 'text-slate-400'}`}>
                            {new Date(m.createdAt).toLocaleString('ar-IQ')} • {m.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }} className="min-h-[54px] flex-1 rounded-2xl border p-3 outline-none focus:ring-2 focus:ring-slate-300" placeholder="اكتب الرد هنا..." />
                    <button disabled={sending || !reply.trim()} onClick={sendReply} className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-5 py-3 font-black text-white disabled:opacity-50">
                      <Send className="h-4 w-4" /> إرسال
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
