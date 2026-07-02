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
  getAiModels,
  getAiLogs,
  syncOllamaModels,
  runAiSkill,
  setDefaultAiModel,
  updateAiSettings,
  updateAiPrompt,
  updateAiSkill,
  updateAiTool,
  getAiRules,
  updateAiRule,
  getAiConversations,
  getAiConversation,
  ingestAiConversation,
  decideAiConversation,
  getAiRuntimeSettings,
  updateAiRuntimeSettings,
  getAiReplyTemplates,
  updateAiReplyTemplate,
  createAiReplyTemplate,
} from '@/api/ai';

const tabs = [
  'Dashboard',
  'General',
  'Providers',
  'Models',
  'Prompts',
  'Knowledge Base',
  'Rules',
  'Skills',
  'Tools',
  'Memory',
  'Conversations',
  'قوالب الردود الذكية',
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
                {item.enabled ? 'مفعل' : 'معطل'}
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




function AiGeneralSettingsTab({ statusData }: { statusData: any }) {
  const qc = useQueryClient();
  const settings = statusData?.settings;

  const [form, setForm] = useState<any>(() => settings || {});

  useMemo(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateAiSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const setValue = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  if (!settings) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
        جاري تحميل إعدادات AI...
      </div>
    );
  }

  const numberFields = [
    ['temperature', 'Temperature'],
    ['topP', 'Top P'],
    ['topK', 'Top K'],
    ['contextSize', 'Context Size'],
    ['maxTokens', 'Max Tokens'],
    ['timeoutMs', 'Timeout ms'],
    ['threads', 'Threads'],
    ['gpuLayers', 'GPU Layers'],
    ['memoryMb', 'Memory MB'],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">General Settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              كل هذه الإعدادات محفوظة في قاعدة البيانات وليست ثابتة داخل الكود.
            </p>
          </div>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            {saveMutation.isPending ? 'جاري الحفظ...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {saveMutation.isSuccess ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          تم حفظ إعدادات AI بنجاح.
        </div>
      ) : null}

      {saveMutation.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          فشل حفظ الإعدادات.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-5 text-lg font-black">Runtime</div>

          <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <span className="font-bold">AI مفعل</span>
            <input
              type="checkbox"
              checked={Boolean(form.enabled)}
              onChange={(e) => setValue('enabled', e.target.checked)}
              className="h-5 w-5"
            />
          </label>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-500">Provider</label>
              <input
                value={form.provider || ''}
                onChange={(e) => setValue('provider', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-500">Model</label>
              <input
                value={form.model || ''}
                onChange={(e) => setValue('model', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-500">Keep Alive</label>
              <input
                value={form.keepAlive || ''}
                onChange={(e) => setValue('keepAlive', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
              <span className="font-bold">Streaming</span>
              <input
                type="checkbox"
                checked={Boolean(form.streaming)}
                onChange={(e) => setValue('streaming', e.target.checked)}
                className="h-5 w-5"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-5 text-lg font-black">Generation Parameters</div>

          <div className="grid gap-4 sm:grid-cols-2">
            {numberFields.map(([key, label]) => (
              <div key={key}>
                <label className="mb-2 block text-sm font-bold text-slate-500">{label}</label>
                <input
                  type="number"
                  value={form[key] ?? ''}
                  onChange={(e) => setValue(key, Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function AiDashboardHome({ statusData }: { statusData: any }) {
  const logsQuery = useQuery({
    queryKey: ['ai-logs'],
    queryFn: getAiLogs,
    refetchInterval: 5000,
  });

  const modelsQuery = useQuery({
    queryKey: ['ai-models'],
    queryFn: getAiModels,
    refetchInterval: 10000,
  });

  const logs = logsQuery.data || [];
  const models = modelsQuery.data || [];
  const settings = statusData?.settings;
  const summary = statusData?.summary;

  const successfulLogs = logs.filter((x: any) => x.success);
  const avgLatency = successfulLogs.length
    ? Math.round(successfulLogs.reduce((sum: number, x: any) => sum + Number(x.latencyMs || 0), 0) / successfulLogs.length)
    : 0;

  const latest = logs.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">AI Engine</div>
          <div className="mt-2 text-3xl font-black">{settings?.enabled ? 'Running' : 'معطل'}</div>
          <div className="mt-2 text-xs text-slate-400">Safe mode controlled from General</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Active Model</div>
          <div className="mt-2 truncate text-3xl font-black">{settings?.model || '—'}</div>
          <div className="mt-2 text-xs text-slate-400">Provider: {settings?.provider || '—'}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Average Latency</div>
          <div className="mt-2 text-3xl font-black">{avgLatency ? `${avgLatency} ms` : '—'}</div>
          <div className="mt-2 text-xs text-slate-400">Based on recent AI logs</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Installed Models</div>
          <div className="mt-2 text-3xl font-black">{models.length}</div>
          <div className="mt-2 text-xs text-slate-400">Synced from database</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Prompts</div>
          <div className="mt-2 text-4xl font-black">{summary?.prompts ?? 0}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Skills</div>
          <div className="mt-2 text-4xl font-black">{summary?.skills ?? 0}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm font-bold text-slate-500">Tools</div>
          <div className="mt-2 text-4xl font-black">{summary?.tools ?? 0}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">Live AI Activity</h2>
            <p className="text-sm text-slate-500">آخر عمليات الذكاء الاصطناعي، تتحدث كل 5 ثوانٍ.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 dark:bg-slate-900">
            {logsQuery.isFetching ? 'Refreshing' : 'Live'}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="hidden grid-cols-6 gap-3 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 dark:bg-slate-900 md:grid">
            <div>Time</div>
            <div>Source</div>
            <div>Skill</div>
            <div>Model</div>
            <div>Latency</div>
            <div>Status</div>
          </div>

          {latest.length ? latest.map((log: any) => (
            <div
              key={log.id}
              className="grid gap-2 border-t border-slate-100 px-4 py-4 text-sm dark:border-slate-800 md:grid-cols-6"
            >
              <div className="text-slate-500">{new Date(log.createdAt).toLocaleTimeString('ar-IQ')}</div>
              <div className="font-bold">{log.source || '—'}</div>
              <div>{log.skillKey || '—'}</div>
              <div className="truncate">{log.model || '—'}</div>
              <div>{log.latencyMs ? `${log.latencyMs} ms` : '—'}</div>
              <div>
                <span className={log.success ? 'text-emerald-600 font-black' : 'text-red-600 font-black'}>
                  {log.success ? 'Success' : 'Failed'}
                </span>
              </div>
            </div>
          )) : (
            <div className="p-6 text-center text-sm text-slate-500">
              لا توجد عمليات AI مسجلة بعد.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



function formatBytes(value?: number | string | null) {
  if (!value) return '—';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}







function AiRuntimeCard() {
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAiRuntimeSettings,
  });

  const settings = settingsQuery.data || {};

  const updateMutation = useMutation({
    mutationFn: updateAiRuntimeSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-runtime-settings'] });
    },
  });

  const setValue = (key: string, value: any) => {
    updateMutation.mutate({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4">
        <h2 className="text-xl font-black">WhatsApp AI Employee</h2>
        <p className="mt-1 text-sm text-slate-500">
          تحكم بتشغيل موظف AI للردود التلقائية عبر واتساب.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <div>
            <div className="font-black">Auto Reply</div>
            <div className="text-xs text-slate-500">يرسل الرد تلقائياً إذا وافق Policy Engine.</div>
          </div>
          <input
            type="checkbox"
            checked={Boolean(settings.whatsappAutoReplyمفعل)}
            onChange={(e) => setValue('whatsappAutoReplyمفعل', e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <div>
            <div className="font-black">Dry Run</div>
            <div className="text-xs text-slate-500">ينشئ Draft فقط بدون إرسال فعلي.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.whatsappDryRunمفعل !== false}
            onChange={(e) => setValue('whatsappDryRunمفعل', e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <div>
            <div className="font-black">Require Subscriber Match</div>
            <div className="text-xs text-slate-500">لا يرد تلقائياً إذا لم يتم التعرف على المشترك.</div>
          </div>
          <input
            type="checkbox"
            checked={settings.whatsappRequireSubscriber !== false}
            onChange={(e) => setValue('whatsappRequireSubscriber', e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-black">Minimum Confidence</div>
            <div className="text-sm font-black">{Math.round(Number(settings.whatsappMinConfidence ?? 0.9) * 100)}%</div>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.99"
            step="0.01"
            value={Number(settings.whatsappMinConfidence ?? 0.9)}
            onChange={(e) => setValue('whatsappMinConfidence', Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs leading-6 text-slate-500 dark:border-slate-700">
          <div className="font-black text-slate-700 dark:text-slate-200">Policy Engine</div>
          <div className="mt-2">
            الحالة الحالية: {settings.whatsappAutoReplyمفعل ? 'Auto Reply ON' : 'Auto Reply OFF'} ·
            {settings.whatsappDryRunمفعل !== false ? ' Dry Run ON' : ' Dry Run OFF'}
          </div>
          <div>
            الحد الأدنى للثقة: {Math.round(Number(settings.whatsappMinConfidence ?? 0.9) * 100)}% ·
            شرط التعرف على المشترك: {settings.whatsappRequireSubscriber !== false ? 'مفعل' : 'غير مفعل'}
          </div>
        </div>
      </div>
    </div>
  );
}



function AiReplyTemplatesTab() {
  const qc = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ['ai-reply-templates'],
    queryFn: getAiReplyTemplates,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAiReplyTemplate(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-reply-templates'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createAiReplyTemplate({
      key: `custom_${Date.now()}`,
      title: 'قالب جديد',
      intent: 'استفسار عام',
      enabled: true,
      priority: 100,
      conditionsJson: {},
      template: 'أهلاً {{customerName}} ← اسم المشترك، تم استلام رسالتك وسيتم مراجعتها.',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-reply-templates'] });
    },
  });

  const templates = templatesQuery.data || [];

  const save = (item: any, patch: any) => {
    updateMutation.mutate({
      id: item.id,
      payload: {
        title: item.title,
        intent: item.intent,
        enabled: item.enabled,
        priority: item.priority,
        conditionsJson: item.conditionsJson || {},
        template: item.template,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">قوالب الردود الذكية</h2>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {createMutation.isPending ? 'جاري الإضافة...' : '+ إضافة قالب جديد'}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          يمكنك إنشاء وإدارة جميع الردود الذكية التي يستخدمها موظف الذكاء الاصطناعي حسب نوع الطلب والشروط، دون الحاجة لتعديل أي كود.
        </p>

        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
          <div className="font-black">توجيهات إنشاء القالب</div>
          <ul className="mt-2 list-inside list-disc">
            <li>اكتب الرد بصيغة موظف دعم محترم وواضح.</li>
            <li>لا تضع وعداً بوقت صيانة محدد مثل: خلال 10 دقائق.</li>
            <li>لا تذكر سبب المشكلة إذا لم يكن مؤكداً من البيانات.</li>
            <li>استخدم الردود القصيرة المناسبة للواتساب.</li>
            <li>اجعل القالب عاماً وقابل للاستخدام مع أكثر من مشترك.</li>
          </ul>

          <div className="mt-4 font-black">أمثلة مقترحة</div>
          <div className="mt-2 space-y-2">
            <div className="rounded-xl bg-white/70 p-3 dark:bg-black/20">
              {`أهلاً {{customerName}}، تم استلام بلاغك وسيتم تحويله للفريق المختص للمراجعة.`}
            </div>
            <div className="rounded-xl bg-white/70 p-3 dark:bg-black/20">
              {`أهلاً {{customerName}}، حسب البيانات المتوفرة يوجد مبلغ مستحق قدره {{debt}} د.ع.`}
            </div>
            <div className="rounded-xl bg-white/70 p-3 dark:bg-black/20">
              أهلاً بك، يرجى تزويدنا برقم الهاتف أو اسم المستخدم حتى نتمكن من التحقق من حالة الخدمة.
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          المتغيرات المتاحة:
          <span className="mx-1 rounded bg-white px-2 py-1 font-mono dark:bg-slate-950">{'{{customerName}} ← اسم المشترك'}</span>
          <span className="mx-1 rounded bg-white px-2 py-1 font-mono dark:bg-slate-950">{'{{debt}} ← قيمة الدين'}</span>
          <span className="mx-1 rounded bg-white px-2 py-1 font-mono dark:bg-slate-950">{'{{status}} ← حالة الاشتراك'}</span>
          <span className="mx-1 rounded bg-white px-2 py-1 font-mono dark:bg-slate-950">{'{{package}} ← اسم الباقة'}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {templates.map((item: any) => (
          <div
            key={item.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-lg font-black">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{item.key}</div>
              </div>

              <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black dark:bg-slate-900">
                <span>{item.enabled ? 'مفعل' : 'معطل'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(item.enabled)}
                  onChange={(e) => save(item, { enabled: e.target.checked })}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">اسم القالب</label>
                <input
                  defaultValue={item.title}
                  onBlur={(e) => save(item, { title: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">نوع الطلب</label>
                <select
                  value={item.intent}
                  onChange={(e) => save(item, { intent: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value="انقطاع الإنترنت">انقطاع الإنترنت</option>
                  <option value="بطء الإنترنت">بطء الإنترنت</option>
                  <option value="الاستعلام عن الرصيد أو الدين">الاستعلام عن الرصيد أو الدين</option>
                  <option value="التجديد والتفعيل">التجديد والتفعيل</option>
                  <option value="استفسار عام">استفسار عام</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">الأولوية</label>
                <input
                  type="number"
                  defaultValue={item.priority || 100}
                  onBlur={(e) => save(item, { priority: Number(e.target.value || 100) })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-500">شروط التطبيق</label>
              <textarea
                defaultValue={JSON.stringify(item.conditionsJson || {}, null, 2)}
                onBlur={(e) => {
                  try {
                    save(item, { conditionsJson: JSON.parse(e.target.value || '{}') });
                  } catch {
                    alert('شروط التطبيق غير صحيح');
                  }
                }}
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-500">نص الرد</label>
              <textarea
                defaultValue={item.template}
                onBlur={(e) => save(item, { template: e.target.value })}
                className="min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
          </div>
        ))}

        {!templates.length ? (
          <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
            لا توجد قوالب بعد.
          </div>
        ) : null}
      </div>
    </div>
  );
}


function AiConversationsTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [testPhone, setTestPhone] = useState('07832557250');
  const [testMessage, setTestMessage] = useState('الإنترنت مقطوع عندي من الصبح');

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: getAiConversations,
    refetchInterval: 5000,
  });

  const selectedQuery = useQuery({
    queryKey: ['ai-conversation', selectedId],
    queryFn: () => getAiConversation(selectedId as number),
    enabled: Boolean(selectedId),
    refetchInterval: 5000,
  });

  const ingestMutation = useMutation({
    mutationFn: () =>
      ingestAiConversation({
        channel: 'whatsapp',
        customerPhone: testPhone,
        message: testMessage,
        source: 'ai-center-test',
      }),
    onSuccess: (data: any) => {
      setSelectedId(data.conversation.id);
      qc.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });

  const decideMutation = useMutation({
    mutationFn: (id: number) => decideAiConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations'] });
      qc.invalidateQueries({ queryKey: ['ai-conversation', selectedId] });
    },
  });

  const conversations = conversationsQuery.data || [];
  const selected = selectedQuery.data;

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <AiRuntimeCard />

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-xl font-black">AI Conversations</h2>
          <p className="mt-1 text-sm text-slate-500">
            محادثات AI العامة لكل القنوات: WhatsApp / Tickets / Portal.
          </p>

          <div className="mt-5 grid gap-3">
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              placeholder="رقم الزبون"
            />
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              placeholder="رسالة الزبون"
            />
            <button
              onClick={() => ingestMutation.mutate()}
              disabled={ingestMutation.isPending}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {ingestMutation.isPending ? 'جاري الإدخال...' : 'Ingest Test Message'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 px-2 text-sm font-black text-slate-500">آخر المحادثات</div>
          <div className="space-y-2">
            {conversations.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={[
                  'w-full rounded-2xl p-4 text-right transition',
                  selectedId === c.id
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black">{c.customerName || c.customerPhone || 'Unknown'}</span>
                  <span className="rounded-full bg-white/20 px-2 py-1 text-[11px]">{c.channel}</span>
                </div>
                <div className="mt-1 text-xs opacity-70">
                  {c.intent || 'استفسار عام'} · {c.stage || '—'}
                </div>
                <div className="mt-2 line-clamp-2 text-xs opacity-70">
                  {c.lastSummary || c.messages?.[0]?.content || ''}
                </div>
              </button>
            ))}

            {!conversations.length ? (
              <div className="p-6 text-center text-sm text-slate-500">لا توجد محادثات بعد.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {!selected ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
            اختر محادثة من القائمة.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-black">{selected.customerName || selected.customerPhone}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.channel} · {selected.intent || 'استفسار عام'} · {selected.stage || '—'}
                </p>
              </div>

              <button
                onClick={() => decideMutation.mutate(selected.id)}
                disabled={decideMutation.isPending}
                className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {decideMutation.isPending ? 'جاري القرار...' : 'Run Decision'}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-500">Status</div>
                <div className="mt-1 font-black">{selected.status}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-500">Handoff</div>
                <div className="mt-1 font-black">{selected.handoffRequired ? 'Required' : 'No'}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-500">Assigned</div>
                <div className="mt-1 font-black">{selected.assignedTo}</div>
              </div>
            </div>

            {selected.subscriberJson?.subscriber ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 text-lg font-black">Subscriber Context</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Name</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.name || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Status</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.status || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Package</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.package || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Debt</div>
                    <div className="mt-1 font-black">{Number(selected.subscriberJson.subscriber.debt || 0).toLocaleString('en-US')} د.ع</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Source</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.dataSource || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">PPPoE</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.pppoeUsername || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Phone</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.phone || '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3 dark:bg-slate-950">
                    <div className="text-xs text-slate-500">Area</div>
                    <div className="mt-1 font-black">{selected.subscriberJson.subscriber.address || '—'}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {selected.messages?.some((m: any) => m.role === 'ai') ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50">
                <div className="mb-4 text-lg font-black">AI Decision</div>
                {selected.messages
                  .filter((m: any) => m.role === 'ai')
                  .slice(-1)
                  .map((m: any) => (
                    <div key={m.id} className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
                          <div className="text-xs opacity-70">Confidence</div>
                          <div className="text-2xl font-black">{m.confidence ? Math.round(m.confidence * 100) : 0}%</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
                          <div className="text-xs opacity-70">Reply Type</div>
                          <div className="font-black">{m.metaJson?.replyType || '—'}</div>
                        </div>
                        <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
                          <div className="text-xs opacity-70">Should Reply</div>
                          <div className="font-black">{m.metaJson?.shouldReply ? 'Yes' : 'No'}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/70 p-4 leading-7 dark:bg-black/20">
                        <div className="mb-1 text-xs font-black opacity-70">Reason</div>
                        {m.metaJson?.reason || '—'}
                      </div>

                      {m.metaJson?.policy ? (
                        <div className={m.metaJson.policy.allowed ? "rounded-2xl border border-emerald-200 bg-emerald-100/80 p-4 leading-7 dark:border-emerald-800 dark:bg-emerald-900/40" : "rounded-2xl border border-red-200 bg-red-100/80 p-4 leading-7 dark:border-red-800 dark:bg-red-900/40"}>
                          <div className="mb-2 text-xs font-black opacity-70">Policy Engine</div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div>
                              <div className="text-xs opacity-70">Status</div>
                              <div className="font-black">{m.metaJson.policy.allowed ? 'Allowed' : 'Blocked / Review'}</div>
                            </div>
                            <div>
                              <div className="text-xs opacity-70">Action</div>
                              <div className="font-black">{m.metaJson.policy.action || '—'}</div>
                            </div>
                            <div>
                              <div className="text-xs opacity-70">Confidence</div>
                              <div className="font-black">{Math.round(Number(m.metaJson.policy.confidence || 0) * 100)}%</div>
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs font-black opacity-70">Reasons</div>
                            <ul className="mt-1 list-inside list-disc text-sm">
                              {(m.metaJson.policy.reasons || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        </div>
                      ) : null}

                      <div className="rounded-2xl bg-white/70 p-4 leading-7 dark:bg-black/20">
                        <div className="mb-1 text-xs font-black opacity-70">Draft Reply</div>
                        {m.content}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}

            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm leading-7 text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <div className="mb-2 font-black">Summary</div>
              <pre className="whitespace-pre-wrap font-sans">{selected.lastSummary || '—'}</pre>
            </div>

            <div className="space-y-3">
              <div className="font-black">Messages</div>
              {(selected.messages || []).map((m: any) => (
                <div
                  key={m.id}
                  className={[
                    'rounded-2xl p-4 text-sm leading-7',
                    m.role === 'customer'
                      ? 'bg-slate-100 dark:bg-slate-900'
                      : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
                  ].join(' ')}
                >
                  <div className="mb-1 text-xs font-black opacity-60">
                    {m.role} · {m.direction || '—'} · {m.confidence ? `${Math.round(m.confidence * 100)}%` : ''}
                  </div>
                  {m.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function AiRulesManagerTab() {
  const qc = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['ai-rules'],
    queryFn: getAiRules,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAiRule(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-rules'] });
    },
  });

  const rules = rulesQuery.data || [];

  const severityClass = (severity: string) => {
    if (severity === 'high') return 'bg-red-100 text-red-700';
    if (severity === 'medium') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-xl font-black">Rules Manager</h2>
        <p className="mt-1 text-sm text-slate-500">
          قواعد الحماية والسلوك التي يلتزم بها Albarq AI أثناء التحليل.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {rules.map((rule: any) => (
          <div
            key={rule.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black">{rule.title}</div>
                <div className="mt-1 text-xs text-slate-500">{rule.key}</div>
              </div>

              <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black dark:bg-slate-900">
                <span>{rule.enabled ? 'مفعل' : 'معطل'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(rule.enabled)}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: rule.id,
                      payload: { enabled: e.target.checked },
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-500">Rule Content</label>
              <textarea
                defaultValue={rule.content || ''}
                onBlur={(e) =>
                  updateMutation.mutate({
                    id: rule.id,
                    payload: { content: e.target.value },
                  })
                }
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${severityClass(rule.severity)}`}>
                {rule.severity}
              </span>

              <select
                value={rule.severity || 'medium'}
                onChange={(e) =>
                  updateMutation.mutate({
                    id: rule.id,
                    payload: { severity: e.target.value },
                  })
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AiToolsManagerTab() {
  const qc = useQueryClient();

  const toolsQuery = useQuery({
    queryKey: ['ai-tools'],
    queryFn: getAiTools,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAiTool(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-tools'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const tools = toolsQuery.data || [];

  const riskClass = (risk: string) => {
    if (risk === 'dangerous') return 'bg-red-100 text-red-700';
    if (risk === 'write') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-xl font-black">Tools Manager</h2>
        <p className="mt-1 text-sm text-slate-500">
          إدارة الأدوات التي يستطيع AI استخدامها. حالياً الأدوات Read Only وآمنة.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {tools.map((tool: any) => (
          <div
            key={tool.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black">{tool.title}</div>
                <div className="mt-1 text-xs text-slate-500">{tool.key}</div>
              </div>

              <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black dark:bg-slate-900">
                <span>{tool.enabled ? 'مفعل' : 'معطل'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(tool.enabled)}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: tool.id,
                      payload: { enabled: e.target.checked },
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${riskClass(tool.riskLevel)}`}>
                {tool.riskLevel}
              </span>

              <select
                value={tool.riskLevel || 'read_only'}
                onChange={(e) =>
                  updateMutation.mutate({
                    id: tool.id,
                    payload: { riskLevel: e.target.value },
                  })
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="read_only">read_only</option>
                <option value="write">write</option>
                <option value="dangerous">dangerous</option>
              </select>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
              هذه الأداة مسجلة فقط. التنفيذ الحقيقي للأداة سيتم في Tool Engine لاحقاً.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AiSkillsManagerTab() {
  const qc = useQueryClient();

  const skillsQuery = useQuery({
    queryKey: ['ai-skills'],
    queryFn: getAiSkills,
  });

  const promptsQuery = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: getAiPrompts,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAiSkill(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-skills'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const skills = skillsQuery.data || [];
  const prompts = promptsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-xl font-black">Skills Manager</h2>
        <p className="mt-1 text-sm text-slate-500">
          تشغيل وإيقاف مهارات الذكاء الاصطناعي وربط كل Skill بالـ Prompt المناسب.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {skills.map((skill: any) => (
          <div
            key={skill.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black">{skill.title}</div>
                <div className="mt-1 text-xs text-slate-500">{skill.key}</div>
              </div>

              <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black dark:bg-slate-900">
                <span>{skill.enabled ? 'مفعل' : 'معطل'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(skill.enabled)}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: skill.id,
                      payload: { enabled: e.target.checked },
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">Prompt</label>
                <select
                  value={skill.promptKey || ''}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: skill.id,
                      payload: { promptKey: e.target.value },
                    })
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value="">No Prompt</option>
                  {prompts.map((p: any) => (
                    <option key={p.key} value={p.key}>
                      {p.title} / {p.key}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">Model Override</label>
                <input
                  defaultValue={skill.modelName || ''}
                  onBlur={(e) =>
                    updateMutation.mutate({
                      id: skill.id,
                      payload: { modelName: e.target.value },
                    })
                  }
                  placeholder="فارغ = الموديل الافتراضي"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">
              Tools: {Array.isArray(skill.toolsJson) ? skill.toolsJson.length : 0} · Model: {skill.modelName || 'Default'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AiPromptsStudioTab() {
  const qc = useQueryClient();
  const promptsQuery = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: getAiPrompts,
  });

  const prompts = promptsQuery.data || [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = prompts.find((p: any) => p.id === selectedId) || prompts[0];

  const [form, setForm] = useState<any>({});

  useMemo(() => {
    if (selected) setForm(selected);
  }, [selected?.id]);

  const saveMutation = useMutation({
    mutationFn: () => updateAiPrompt(form.id, {
      title: form.title,
      content: form.content,
      enabled: form.enabled,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-prompts'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  if (promptsQuery.isLoading) {
    return <div className="rounded-3xl bg-white p-6 dark:bg-slate-950">جاري تحميل البرومبتات...</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 px-2">
          <h2 className="text-xl font-black">Prompt Studio</h2>
          <p className="mt-1 text-sm text-slate-500">إدارة جميع برومبتات Albarq AI من قاعدة البيانات.</p>
        </div>

        <div className="space-y-2">
          {prompts.map((prompt: any) => (
            <button
              key={prompt.id}
              onClick={() => setSelectedId(prompt.id)}
              className={[
                'w-full rounded-2xl p-4 text-right transition',
                selected?.id === prompt.id
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800',
              ].join(' ')}
            >
              <div className="font-black">{prompt.title}</div>
              <div className="mt-1 text-xs opacity-70">{prompt.key} · v{prompt.version}</div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black">{form.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Key: {form.key} · Version: {form.version}
                </p>
              </div>

              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                {saveMutation.isPending ? 'جاري الحفظ...' : 'Save Prompt'}
              </button>
            </div>
          </div>

          {saveMutation.isSuccess ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              تم حفظ البرومبت ورفع رقم الإصدار.
            </div>
          ) : null}

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">اسم القالب</label>
                <input
                  value={form.title || ''}
                  onChange={(e) => setForm((x: any) => ({ ...x, title: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>

              <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <span className="font-bold">مفعل</span>
                <input
                  type="checkbox"
                  checked={Boolean(form.enabled)}
                  onChange={(e) => setForm((x: any) => ({ ...x, enabled: e.target.checked }))}
                  className="h-5 w-5"
                />
              </label>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-500">Prompt Content</label>
              <textarea
                value={form.content || ''}
                onChange={(e) => setForm((x: any) => ({ ...x, content: e.target.value }))}
                className="min-h-[420px] w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-7 text-slate-100 outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800"
                spellCheck={false}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4 text-sm leading-7 text-slate-500 dark:border-slate-700">
              المتغيرات المستقبلية المقترحة:
              <div className="mt-2 flex flex-wrap gap-2">
                {['{{ticket_text}}', '{{subscriber_status}}', '{{debt}} ← قيمة الدين', '{{onu_power}}', '{{pppoe_status}}', '{{call_summary}}'].map((v) => (
                  <span key={v} className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs dark:bg-slate-900">{v}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950">
          لا توجد برومبتات.
        </div>
      )}
    </div>
  );
}


function AiModelsTab() {
  const qc = useQueryClient();

  const modelsQuery = useQuery({
    queryKey: ['ai-models'],
    queryFn: getAiModels,
    refetchInterval: 10000,
  });

  const syncMutation = useMutation({
    mutationFn: syncOllamaModels,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-models'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const defaultMutation = useMutation({
    mutationFn: setDefaultAiModel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-models'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  const models = modelsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">Models</h2>
            <p className="mt-1 text-sm text-slate-500">إدارة موديلات Ollama المخزنة في قاعدة البيانات.</p>
          </div>

          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {syncMutation.isPending ? 'جاري المزامنة...' : 'Sync Ollama Models'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {models.length ? models.map((model: any) => (
          <div
            key={model.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-xl font-black">{model.displayName || model.name}</div>
                <div className="mt-1 text-sm text-slate-500">{model.providerKey}</div>
              </div>

              <span className={model.isDefault ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700' : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500'}>
                {model.isDefault ? 'Default' : model.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                <div className="text-xs text-slate-500">Size</div>
                <div className="mt-1 font-black">{formatBytes(model.sizeBytes)}</div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                <div className="text-xs text-slate-500">Status</div>
                <div className="mt-1 font-black">{model.status}</div>
              </div>
            </div>

            <button
              onClick={() => defaultMutation.mutate(model.id)}
              disabled={model.isDefault || defaultMutation.isPending}
              className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              {model.isDefault ? 'الموديل الافتراضي حالياً' : 'Set as Default'}
            </button>
          </div>
        )) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950">
            لا توجد موديلات بعد. اضغط Sync Ollama Models.
          </div>
        )}
      </div>
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
          فشل التحليل. تأكد أن AI مفعل وأن Skill مفعلة وأن Ollama يعمل.
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
      value: settings?.enabled ? 'مفعل' : 'معطل',
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
          {activeTab === 'Dashboard' ? (
            <AiDashboardHome statusData={statusQuery.data} />
          ) : activeTab === 'General' ? (
            <AiGeneralSettingsTab statusData={statusQuery.data} />
          ) : activeTab === 'Models' ? (
            <AiModelsTab />
          ) : activeTab === 'Prompts' ? (
            <AiPromptsStudioTab />
          ) : activeTab === 'Skills' ? (
            <AiSkillsManagerTab />
          ) : activeTab === 'Tools' ? (
            <AiToolsManagerTab />
          ) : activeTab === 'Rules' ? (
            <AiRulesManagerTab />
          ) : activeTab === 'Conversations' ? (
            <AiConversationsTab />
          ) : activeTab === 'قوالب الردود الذكية' ? (
            <AiReplyTemplatesTab />
          ) : activeTab === 'Playground' ? (
            <TicketAnalyzerTest />
          ) : (
            <PlaceholderTab name={activeTab} />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <Lock className="mb-3 h-6 w-6" />
              <h3 className="font-bold">Safe Default</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                AI يبقى معطل حتى يتم تفعيله من الإعدادات.
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
