import {
  BrainCircuit,
  Cpu,
  Database,
  Gauge,
  Lock,
  MessageSquareText,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bootstrapAi,
  getAiPrompts,
  getAiSkills,
  getAiStatus,
  getAiTools,
  syncOllamaModels,
  runAiSkill,
} from '@/api/ai';

const tabs = [
  'General',
  'Providers',
  'Models',
  'Prompts',
  'Knowledge Base',
  'Rules',
  'Skills',
  'Tools',
  'Memory',
  'Playground',
  'Analytics',
  'Logs',
  'Security',
  'Backup',
  'Restore',
  'Performance',
  'Advanced',
];

function PlaceholderTab({ name }: { name: string }) {
  const promptsQuery = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: getAiPrompts,
    enabled: name === 'Prompts',
  });

  const skillsQuery = useQuery({
    queryKey: ['ai-skills'],
    queryFn: getAiSkills,
    enabled: name === 'Skills',
  });

  const toolsQuery = useQuery({
    queryKey: ['ai-tools'],
    queryFn: getAiTools,
    enabled: name === 'Tools',
  });

  const content = useMemo(() => {
    const map: Record<string, string> = {
      General: 'إعدادات التشغيل العامة، اختيار Provider، Model، Temperature، Tokens، Timeout، Streaming، Memory، Keep Alive.',
      Providers: 'إدارة Ollama حالياً، مع قابلية إضافة OpenAI / Claude / Gemini / DeepSeek / Qwen / Llama / Mistral مستقبلاً من الواجهة.',
      Models: 'عرض موديلات Ollama، التحميل، الحذف، التحديث، اختيار الافتراضي، ومراقبة RAM والحالة.',
      Prompts: 'كل قسم يمتلك Prompt مستقل بدون أي Prompt ثابت داخل الكود.',
      'Knowledge Base': 'رفع ملفات PDF / Word / Excel / Markdown / TXT / CSV لاستخدامها لاحقاً ضمن الذكاء الاصطناعي.',
      Rules: 'قواعد الثقة، منع التخمين، منع كشف البيانات، ومنع تنفيذ أي إجراء دون موافقة.',
      Skills: 'تشغيل وإيقاف Skills مثل Call Analyzer وTicket Analyzer وEngineer Assistant.',
      Tools: 'إدارة أدوات الذكاء الاصطناعي مثل قراءة المشترك، الديون، التكتات، المكالمات، ONU وPPPoE.',
      Memory: 'إدارة ذاكرة النظام المستقبلية وسياقات العمل بدون كشف بيانات حساسة.',
      Playground: 'تجربة Prompt/Response مع Latency وTokens وConfidence وRaw Output.',
      Analytics: 'إحصائيات الاستخدام، السرعة، أكثر المشاكل، وأكثر المهارات استخداماً.',
      Logs: 'سجل كل طلب ورد والموديل والوقت والتوكنات والأخطاء.',
      Security: 'صلاحيات استخدام وتعديل الذكاء الاصطناعي.',
      Backup: 'تصدير إعدادات AI بصيغة JSON.',
      Restore: 'استيراد إعدادات AI من نسخة JSON.',
      Performance: 'مراقبة CPU/RAM/Threads/GPU Layers ووقت الاستجابة.',
      Advanced: 'إعدادات متقدمة قابلة للتوسع بدون تعديل الكود.',
    };
    return map[name] || 'قسم قابل للتوسعة لاحقاً.';
  }, [name]);

  const list =
    name === 'Prompts'
      ? promptsQuery.data
      : name === 'Skills'
        ? skillsQuery.data
        : name === 'Tools'
          ? toolsQuery.data
          : null;

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          <p className="text-sm text-slate-500">Connected to backend foundation</p>
        </div>
      </div>

      <p className="leading-8 text-slate-700 dark:text-slate-300">{content}</p>

      {list ? (
        <div className="mt-6 space-y-2">
          {list.map((item: any) => (
            <div
              key={item.id || item.key}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="font-black">{item.title || item.name || item.key}</div>
                <div className="text-xs text-slate-500">{item.key}</div>
              </div>
              <span className={item.enabled ? 'text-emerald-600' : 'text-slate-400'}>
                {item.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">
          هذا القسم جاهز للربط التفصيلي بالمرحلة القادمة.
        </div>
      )}
    </div>
  );
}


function TicketAnalyzerTest() {
  const [input, setInput] = useState('الانترنت ضعيف والاشتراك فعال.');
  const [result, setResult] = useState<any>(null);

  const runMutation = useMutation({
    mutationFn: () =>
      runAiSkill('ticket_analyzer', input, {
        source: 'ai-center',
        subscriberStatus: 'active',
      }),
    onSuccess: (data) => setResult(data),
  });

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4">
        <h2 className="text-xl font-black">Ticket Analyzer Test</h2>
        <p className="mt-1 text-sm text-slate-500">
          تجربة حقيقية على AI Skill Engine. لا يتم إرسال أي شيء للزبون.
        </p>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
        placeholder="اكتب وصف التكت هنا..."
      />

      <button
        onClick={() => runMutation.mutate()}
        disabled={runMutation.isPending || !input.trim()}
        className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
      >
        {runMutation.isPending ? 'جاري التحليل...' : 'Analyze Ticket'}
      </button>

      {runMutation.isError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          فشل التحليل. تأكد أن AI Enabled وأن Skill مفعلة وأن Ollama يعمل.
        </div>
      ) : null}

      {result?.result ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <div className="text-xs font-bold text-slate-500">Answer</div>
            <div className="mt-2 font-black">{result.result.answer}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
              <div className="text-xs font-bold text-slate-500">Confidence</div>
              <div className="mt-2 text-2xl font-black">{Math.round((result.result.confidence || 0) * 100)}%</div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
              <div className="text-xs font-bold text-slate-500">Latency</div>
              <div className="mt-2 text-2xl font-black">{result.latencyMs} ms</div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <div className="text-xs font-bold text-slate-500">Reason</div>
            <div className="mt-2 leading-7">{result.result.reason}</div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <div className="text-xs font-bold text-slate-500">Proposed Actions</div>
            <ul className="mt-2 list-inside list-disc space-y-1 leading-7">
              {(result.result.proposedActions || []).map((x: string, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="text-xs font-black text-emerald-700">Suggested Reply فقط، ليس إرسال تلقائي</div>
            <div className="mt-2 leading-7">{result.result.suggestedReply}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


export default function AiCenter() {
  const [activeTab, setActiveTab] = useState('General');
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: getAiStatus,
  });

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapAi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-status'] }),
  });

  const syncModelsMutation = useMutation({
    mutationFn: syncOllamaModels,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-status'] }),
  });

  const settings = statusQuery.data?.settings;
  const summary = statusQuery.data?.summary;

  const cards = [
    {
      title: 'AI Status',
      value: settings?.enabled ? 'Enabled' : 'Disabled',
      hint: settings?.enabled ? 'Active' : 'Safe by default',
      icon: ShieldCheck,
    },
    {
      title: 'Provider',
      value: settings?.provider || '—',
      hint: 'Current runtime',
      icon: Server,
    },
    {
      title: 'Model',
      value: settings?.model || '—',
      hint: 'Default model',
      icon: BrainCircuit,
    },
    {
      title: 'Prompts',
      value: String(summary?.prompts ?? '—'),
      hint: 'Stored in DB',
      icon: MessageSquareText,
    },
    {
      title: 'Skills',
      value: String(summary?.skills ?? '—'),
      hint: 'Independent modules',
      icon: Cpu,
    },
    {
      title: 'Tools',
      value: String(summary?.tools ?? '—'),
      hint: 'Read-only now',
      icon: Wrench,
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-xl dark:border-slate-800">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200">
              <Sparkles className="h-4 w-4" />
              Albarq AI Operating System
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              مركز التحكم بالذكاء الاصطناعي
            </h1>
            <p className="mt-3 max-w-3xl leading-8 text-slate-300">
              منصة إدارة Albarq AI داخل نظام Call Center. الحالة والإعدادات الآن تقرأ من Backend الحقيقي.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => bootstrapMutation.mutate()}
              disabled={bootstrapMutation.isPending}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {bootstrapMutation.isPending ? 'جاري التهيئة...' : 'Bootstrap AI'}
            </button>

            <button
              onClick={() => syncModelsMutation.mutate()}
              disabled={syncModelsMutation.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-400 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {syncModelsMutation.isPending ? 'جاري المزامنة...' : 'Sync Ollama Models'}
            </button>
          </div>
        </div>
      </div>

      {statusQuery.isError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
          تعذر الاتصال بـ AI Backend. تأكد من تشغيل backend وصلاحية المستخدم.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs text-slate-400">{card.hint}</span>
              </div>
              <div className="text-sm text-slate-500">{card.title}</div>
              <div className="mt-1 truncate text-2xl font-black">
                {statusQuery.isLoading ? '...' : card.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex items-center gap-2 px-3 py-2 font-bold">
            <Cpu className="h-5 w-5" />
            AI Control Center
          </div>

          <div className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'w-full rounded-2xl px-4 py-3 text-right text-sm font-semibold transition',
                  activeTab === tab
                    ? 'bg-slate-950 text-white shadow dark:bg-white dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'Playground' ? <TicketAnalyzerTest /> : <PlaceholderTab name={activeTab} />}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <Lock className="mb-3 h-6 w-6" />
              <h3 className="font-bold">Safe Default</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                AI يبقى Disabled حتى يتم تفعيله من الإعدادات.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <Database className="mb-3 h-6 w-6" />
              <h3 className="font-bold">Database Backed</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Prompts وSkills وTools مخزنة الآن بجداول Prisma.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <Gauge className="mb-3 h-6 w-6" />
              <h3 className="font-bold">Production Path</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                الربط القادم: إعدادات General قابلة للتعديل من الواجهة.
              </p>
            </div>
          </div>
        </div>
      </div>

      {bootstrapMutation.isSuccess ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          تمت تهيئة Albarq AI بنجاح.
        </div>
      ) : null}

      {syncModelsMutation.isSuccess ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          تمت مزامنة موديلات Ollama بنجاح. العدد: {syncModelsMutation.data?.length || 0}
        </div>
      ) : null}

      {syncModelsMutation.isError ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
          فشلت مزامنة Ollama. تأكد أن Ollama يعمل وأن backend يصل إلى المنفذ 11434.
        </div>
      ) : null}
    </div>
  );
}
