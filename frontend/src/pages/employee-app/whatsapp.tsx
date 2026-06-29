import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Square,
  X,
} from 'lucide-react';
import { whatsappTwilioApi } from '@/api/whatsappTwilio';

type Conv = {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  unreadCount?: number;
};

type Msg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  status?: string;
  createdAt: string;
};

type ToastType = 'error' | 'success' | 'info';

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
  const [toast, setToast] = useState<{ type: ToastType; text: string } | null>(null);
  const [preparingFile, setPreparingFile] = useState(false);
  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const unreadTotal = useMemo(
    () => convs.reduce((sum, x) => sum + Number(x.unreadCount || 0), 0),
    [convs]
  );

  function showToast(text: string, type: ToastType = 'error') {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function loadConvs(search = q) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('take', '20');
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/whatsapp-twilio/conversations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` },
      });

      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: Conv[] = Array.isArray(data) ? data : data.rows || [];
      setConvs(list);

      if (!active && list[0]) {
        setActive(list[0]);
        await loadMessages(list[0].id);
      }
    } catch {
      showToast('تعذر تحميل محادثات واتساب');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(id: string) {
    try {
      const data = await whatsappTwilioApi.messages(id);
      setMessages(Array.isArray(data) ? data : []);
      await whatsappTwilioApi.read(id).catch(() => null);
      setConvs((old) => old.map((x) => (x.id === id ? { ...x, unreadCount: 0 } : x)));
      scrollBottom();
    } catch {
      showToast('تعذر تحميل الرسائل');
    }
  }

  function scrollBottom() {
    window.setTimeout(() => {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);
  }

  async function openConv(conv: Conv) {
    setActive(conv);
    await loadMessages(conv.id);
  }

  async function pickFile(file?: File | null) {
    if (!file) return;

    setPreparingFile(true);
    try {
      const isImage = file.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
      const allowed =
        isImage ||
        file.type.startsWith('audio/') ||
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
        showToast('تم تجهيز الصورة للإرسال', 'success');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setFileData(String(reader.result || ''));
        setFileName(file.name);
        setFileType(file.type || 'application/octet-stream');
        showToast('تم تجهيز المرفق للإرسال', 'success');
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
    } catch {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }



  function bestAudioMime() {
    const choices = [
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];

    for (const t of choices) {
      try {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
      } catch {}
    }

    return '';
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        showToast('التسجيل الصوتي غير مدعوم بهذا المتصفح');
        return;
      }

      clearFile();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = bestAudioMime();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onerror = () => {
        showToast('تعذر تسجيل الصوت');
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };

      rec.onstop = () => {
        const type = rec.mimeType || mimeType || 'audio/mp4';
        const blob = new Blob(audioChunksRef.current, { type });

        if (!blob.size) {
          showToast('لم يتم تسجيل صوت');
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const ext =
          type.includes('mp4') ? 'm4a' :
          type.includes('mpeg') ? 'mp3' :
          type.includes('ogg') ? 'ogg' :
          type.includes('webm') ? 'webm' :
          'audio';

        const reader = new FileReader();
        reader.onload = () => {
          setFileData(String(reader.result || ''));
          setFileName(`voice-${Date.now()}.${ext}`);
          setFileType(type);
          showToast('تم تجهيز التسجيل الصوتي', 'success');
        };
        reader.onerror = () => showToast('تعذر تجهيز التسجيل');
        reader.readAsDataURL(blob);

        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      showToast('تعذر الوصول إلى المايكروفون');
      setRecording(false);
    }
  }

  function stopRecording() {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      showToast('تعذر إيقاف التسجيل');
    } finally {
      setRecording(false);
    }
  }

  function clearFile() {
    setFileData('');
    setFileName('');
    setFileType('');
    setFileInputKey((x) => x + 1);
  }

  async function sendReply() {
    const text = reply.trim();
    if (!active || (!text && !fileData)) return;

    setSending(true);
    try {
      console.log('EMP_WA_SEND', { conversationId: active.id, hasText: !!text, hasFile: !!fileData, fileName, fileType, fileSize: fileData.length });
      const msg = await whatsappTwilioApi.reply(active.id, text, fileData || undefined, fileName || undefined, fileType || undefined);
      setMessages((old) => [...old, msg]);
      setReply('');
      clearFile();
      await loadConvs(q);
      scrollBottom();
    } catch {
      showToast('تعذر إرسال الرسالة');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadConvs('');
    const t = window.setInterval(() => loadConvs(q), 12000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="flex h-screen flex-col px-4 pt-[calc(env(safe-area-inset-top)+18px)]">
      {toast ? (
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
      ) : null}

      {!active ? (
        <>
          <Header unreadTotal={unreadTotal} loading={loading} onRefresh={() => loadConvs(q)} />

          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
            <Search className="h-5 w-5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadConvs(q)}
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              placeholder="بحث بالمحادثات"
            />
          </div>

          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pb-28">
            {convs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => openConv(conv)}
                className="flex w-full items-center gap-3 rounded-[1.5rem] bg-white p-4 text-right shadow-lg shadow-slate-200/70"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                  <MessageCircle className="h-6 w-6" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-950">{conv.name || conv.phone}</p>
                    {conv.unreadCount ? (
                      <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-black text-white">
                        {conv.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-slate-400">
                    {conv.lastMessage || 'مرفق'}
                  </p>
                </div>
              </button>
            ))}

            {!loading && !convs.length ? (
              <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
                <MessageCircle className="mx-auto h-10 w-10 text-sky-500" />
                <h2 className="mt-4 text-lg font-black">لا توجد محادثات</h2>
                <p className="mt-2 text-sm font-bold text-slate-400">صندوق واتساب فارغ حالياً</p>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-lg shadow-slate-200/70">
            <button onClick={() => setActive(null)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-black text-slate-950">{active.name || active.phone}</h1>
              <p className="truncate text-xs font-bold text-slate-400">{active.phone}</p>
            </div>
          </div>

          <div ref={messagesRef} className="mt-4 flex-1 space-y-2 overflow-y-auto pb-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>

          {fileData ? (
            <AttachmentPreview
              fileData={fileData}
              fileName={fileName}
              fileType={fileType}
              onClear={clearFile}
            />
          ) : null}

          <div className="mb-[calc(env(safe-area-inset-bottom)+88px)] flex items-center gap-2 rounded-[1.8rem] bg-white p-2 shadow-xl shadow-slate-200/80">
            <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-slate-50 text-sky-500">
              <Paperclip className="h-5 w-5" />
              <input
                key={`file-${fileInputKey}`}
                type="file"
                accept="image/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>

            <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl bg-slate-50 text-sky-500">
              <ImageIcon className="h-5 w-5" />
              <input
                key={`img-${fileInputKey}`}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>

            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                recording ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-sky-500'
              }`}
            >
              {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendReply()}
              className="min-h-12 min-w-0 flex-1 rounded-full bg-slate-100 px-5 text-sm font-semibold outline-none placeholder:text-slate-400"
              placeholder={recording ? 'جاري التسجيل...' : 'اكتب رسالة'}
            />

            <button
              onClick={sendReply}
              disabled={sending || preparingFile || (!reply.trim() && !fileData)}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-200 disabled:opacity-50"
            >
              {sending || preparingFile ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const outbound = msg.direction === 'outbound';
  const type = String(msg.mediaType || '');
  const isImage = Boolean(msg.mediaUrl) && type.startsWith('image');
  const isAudio = Boolean(msg.mediaUrl) && type.startsWith('audio');
  const isPdf = Boolean(msg.mediaUrl) && type.includes('pdf');

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[72%] overflow-hidden rounded-[1.2rem] shadow-sm ${
          outbound ? 'bg-sky-500 text-white rounded-br-md' : 'bg-white text-slate-950 rounded-bl-md'
        }`}
      >
        {msg.mediaUrl ? (
          isImage ? (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
              <img src={msg.mediaUrl} className="max-h-60 w-full object-cover" />
            </a>
          ) : isAudio ? (
            <div className="px-3 pt-3">
              <audio controls src={msg.mediaUrl} className="h-10 max-w-full" />
            </div>
          ) : (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 pt-3 text-sm font-black underline">
              {isPdf ? <FileText className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
              فتح المرفق
            </a>
          )
        ) : null}

        {msg.body ? (
          <p className="whitespace-pre-wrap px-3 py-2 text-sm font-semibold leading-6">{msg.body}</p>
        ) : null}

        <div className={`flex items-center gap-1 px-3 pb-2 text-[10px] ${outbound ? 'text-sky-100' : 'text-slate-400'}`}>
          <span>{formatTime(msg.createdAt)}</span>
          {outbound ? <CheckCheck className="h-3.5 w-3.5" /> : null}
        </div>
      </div>
    </div>
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
  const isAudio = fileType.startsWith('audio/');
  const isPdf = fileType.includes('pdf');

  return (
    <div className="mb-2 rounded-[1.4rem] bg-white p-3 shadow-lg shadow-slate-200/70">
      <div className="flex gap-3">
        <div className="flex min-h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 text-sky-500">
          {isImage ? (
            <img src={fileData} className="h-full w-full object-cover" />
          ) : isAudio ? (
            <Mic className="h-8 w-8" />
          ) : isPdf ? (
            <FileText className="h-8 w-8" />
          ) : (
            <Paperclip className="h-8 w-8" />
          )}
        </div>

        <div className="min-w-0 flex-1 py-1">
          <p className="truncate text-sm font-black text-slate-950">{fileName || 'مرفق'}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">جاهز للإرسال</p>
          {isAudio ? <p className="mt-2 text-xs font-bold text-sky-500">مرفق صوتي جاهز للإرسال</p> : null}
        </div>

        <button onClick={onClear} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
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

      <button onClick={onRefresh} className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-lg shadow-slate-200">
        <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        {unreadTotal ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">
            {unreadTotal}
          </span>
        ) : null}
      </button>
    </header>
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
