import { PrismaClient } from '@prisma/client';
import { listProviderModels, runProvider } from '../lib/ai/providers/provider-registry.js';

const prisma = new PrismaClient();

const defaultPrompts = [
  ['whatsapp', 'WhatsApp Analyzer', 'حلّل رسالة واتساب بشكل شكاك. لا تخمن. أعطِ درجة الثقة والسبب والإجراءات المقترحة ورداً مقترحاً فقط.'],
  ['calls', 'Call Analyzer', 'حلّل المكالمة أو ملخصها. استخرج المشكلة والنية ودرجة الثقة والخطوة التالية.'],
  ['tickets', 'Ticket Analyzer', 'حلّل التكت وحدد السبب المحتمل والأولوية والإجراء المقترح بدون تنفيذ.'],
  ['subscribers', 'Subscriber Analyzer', 'حلّل بيانات المشترك المتاحة فقط. إذا كانت المعلومات ناقصة قل المعلومات غير كافية.'],
  ['debts', 'Debt Analyzer', 'حلّل حالة الديون واقترح صياغة داخلية للموظف بدون إرسال تلقائي.'],
  ['engineer', 'Engineer Assistant', 'ساعد المهندس بتحليل فني دقيق واذكر الافتراضات بوضوح.'],
  ['manager', 'Manager Assistant', 'قدّم ملخصاً إدارياً مختصراً مبنياً على البيانات المتوفرة فقط.'],
];

const defaultSkills = [
  ['call_analyzer', 'Call Analyzer', 'calls'],
  ['whatsapp_analyzer', 'WhatsApp Analyzer', 'whatsapp'],
  ['ticket_analyzer', 'Ticket Analyzer', 'tickets'],
  ['debt_analyzer', 'Debt Analyzer', 'debts'],
  ['subscriber_analyzer', 'Subscriber Analyzer', 'subscribers'],
  ['onu_analyzer', 'ONU Analyzer', 'engineer'],
  ['sales_assistant', 'Sales Assistant', 'manager'],
  ['engineer_assistant', 'Engineer Assistant', 'engineer'],
  ['manager_assistant', 'Manager Assistant', 'manager'],
];

const defaultTools = [
  ['read_subscriber', 'قراءة المشترك'],
  ['read_debts', 'قراءة الديون'],
  ['read_tickets', 'قراءة التكتات'],
  ['read_calls', 'قراءة المكالمات'],
  ['read_messages', 'قراءة الرسائل'],
  ['read_onu', 'قراءة ONU'],
  ['read_pppoe', 'قراءة PPPoE'],
];

const defaultRules = [
  ['no_guessing', 'عدم التخمين', 'لا تختلق معلومات. إذا كانت البيانات ناقصة قل: المعلومات غير كافية.'],
  ['suggest_only', 'اقتراح فقط', 'لا ترسل أي رسالة للزبون ولا تنفذ أي إجراء. اعرض اقتراحاً فقط.'],
  ['protect_customer_data', 'حماية بيانات المشترك', 'لا تكشف بيانات حساسة إلا للمستخدم المخول داخل النظام.'],
  ['confidence_required', 'إظهار الثقة', 'كل نتيجة يجب أن تحتوي على درجة ثقة وسبب واضح.'],
];

export async function ensureAiDefaults() {
  await prisma.aiSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  await prisma.aiProvider.upsert({
    where: { key: 'ollama' },
    update: {},
    create: {
      key: 'ollama',
      name: 'Ollama',
      type: 'local',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
      enabled: true,
    },
  });

  for (const [key, title, content] of defaultPrompts) {
    await prisma.aiPrompt.upsert({
      where: { key },
      update: {},
      create: { key, title, content },
    });
  }

  for (const [key, title, promptKey] of defaultSkills) {
    await prisma.aiSkill.upsert({
      where: { key },
      update: {},
      create: { key, title, promptKey, enabled: false },
    });
  }

  for (const [key, title] of defaultTools) {
    await prisma.aiTool.upsert({
      where: { key },
      update: {},
      create: { key, title, enabled: false, riskLevel: 'read_only' },
    });
  }

  for (const [key, title, content] of defaultRules) {
    await prisma.aiRule.upsert({
      where: { key },
      update: {},
      create: { key, title, content, enabled: true, severity: 'high' },
    });
  }
}

export async function getAiStatus() {
  await ensureAiDefaults();

  const settings = await prisma.aiSetting.findUnique({ where: { id: 1 } });
  const providers = await prisma.aiProvider.count();
  const models = await prisma.aiModel.count();
  const prompts = await prisma.aiPrompt.count();
  const skills = await prisma.aiSkill.count();
  const tools = await prisma.aiTool.count();

  return {
    settings,
    summary: {
      providers,
      models,
      prompts,
      skills,
      tools,
    },
  };
}

export async function updateAiSettings(data: any) {
  await ensureAiDefaults();

  return prisma.aiSetting.update({
    where: { id: 1 },
    data: {
      enabled: Boolean(data.enabled),
      provider: data.provider,
      model: data.model,
      temperature: Number(data.temperature),
      topP: Number(data.topP),
      topK: Number(data.topK),
      contextSize: Number(data.contextSize),
      maxTokens: Number(data.maxTokens),
      timeoutMs: Number(data.timeoutMs),
      streaming: Boolean(data.streaming),
      threads: Number(data.threads),
      gpuLayers: Number(data.gpuLayers),
      memoryMb: Number(data.memoryMb),
      keepAlive: data.keepAlive,
    },
  });
}

export async function syncOllamaModels() {
  await ensureAiDefaults();

  const models = await listProviderModels('ollama');
  const saved = [];

  for (const model of models) {
    const item = await prisma.aiModel.upsert({
      where: {
        providerKey_name: {
          providerKey: 'ollama',
          name: model.name,
        },
      },
      update: {
        sizeBytes: typeof model.size === 'number' ? BigInt(model.size) : null,
        status: 'available',
        metaJson: model,
      },
      create: {
        providerKey: 'ollama',
        name: model.name,
        displayName: model.name,
        sizeBytes: typeof model.size === 'number' ? BigInt(model.size) : null,
        status: 'available',
        metaJson: model,
      },
    });

    saved.push({ ...item, sizeBytes: item.sizeBytes ? item.sizeBytes.toString() : null });
  }

  return saved;
}

export async function runPlayground(prompt: string) {
  await ensureAiDefaults();

  const settings = await prisma.aiSetting.findUnique({ where: { id: 1 } });
  if (!settings?.enabled) {
    throw new Error('AI is disabled from AI Control Center.');
  }

  const started = Date.now();

  try {
    const result = await runProvider({
      provider: settings.provider,
      model: settings.model,
      prompt,
      systemPrompt: 'أنت Albarq AI. كن شكاكاً. لا تخمن. اعرض النتيجة بشكل داخلي فقط ولا ترسل شيئاً للزبون.',
    });

    const run = await prisma.aiPlaygroundRun.create({
      data: {
        prompt,
        response: result.text,
        provider: settings.provider,
        model: settings.model,
        confidence: result.confidence,
        latencyMs: result.latencyMs,
        rawJson: result.raw as any,
      },
    });

    await prisma.aiLog.create({
      data: {
        source: 'playground',
        provider: settings.provider,
        model: settings.model,
        prompt,
        response: result.text,
        confidence: result.confidence,
        latencyMs: result.latencyMs,
        success: true,
      },
    });

    return { run, result };
  } catch (err: any) {
    await prisma.aiLog.create({
      data: {
        source: 'playground',
        provider: settings?.provider,
        model: settings?.model,
        prompt,
        latencyMs: Date.now() - started,
        success: false,
        error: err?.message || String(err),
      },
    });
    throw err;
  }
}

export const aiRepo = {
  settings: () => prisma.aiSetting.findUnique({ where: { id: 1 } }),
  providers: () => prisma.aiProvider.findMany({ orderBy: { id: 'asc' } }),
  models: () => prisma.aiModel.findMany({ orderBy: { id: 'asc' } }),
  prompts: () => prisma.aiPrompt.findMany({ orderBy: { id: 'asc' } }),
  skills: () => prisma.aiSkill.findMany({ orderBy: { id: 'asc' } }),
  tools: () => prisma.aiTool.findMany({ orderBy: { id: 'asc' } }),
  rules: () => prisma.aiRule.findMany({ orderBy: { id: 'asc' } }),
  logs: () => prisma.aiLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
};


export async function setDefaultAiModel(id: number) {
  await ensureAiDefaults();

  const model = await prisma.aiModel.findUnique({ where: { id } });
  if (!model) {
    throw new Error('AI model not found');
  }

  await prisma.aiModel.updateMany({
    where: { providerKey: model.providerKey },
    data: { isDefault: false },
  });

  const updated = await prisma.aiModel.update({
    where: { id },
    data: { isDefault: true },
  });

  await prisma.aiSetting.update({
    where: { id: 1 },
    data: {
      provider: model.providerKey,
      model: model.name,
    },
  });

  return {
    ...updated,
    sizeBytes: updated.sizeBytes ? updated.sizeBytes.toString() : null,
  };
}

export async function updateAiPrompt(id: number, data: any) {
  await ensureAiDefaults();

  const prompt = await prisma.aiPrompt.findUnique({ where: { id } });
  if (!prompt) throw new Error('AI prompt not found');

  return prisma.aiPrompt.update({
    where: { id },
    data: {
      title: String(data.title || prompt.title),
      content: String(data.content || prompt.content),
      enabled: typeof data.enabled === 'boolean' ? data.enabled : prompt.enabled,
      version: Number(prompt.version || 1) + 1,
    },
  });
}

export async function updateAiSkill(id: number, data: any) {
  await ensureAiDefaults();

  const skill = await prisma.aiSkill.findUnique({ where: { id } });
  if (!skill) throw new Error('AI skill not found');

  return prisma.aiSkill.update({
    where: { id },
    data: {
      title: String(data.title || skill.title),
      enabled: typeof data.enabled === 'boolean' ? data.enabled : skill.enabled,
      promptKey: typeof data.promptKey === 'string' ? data.promptKey : skill.promptKey,
      modelName: typeof data.modelName === 'string' ? data.modelName : skill.modelName,
      toolsJson: data.toolsJson ?? skill.toolsJson,
      configJson: data.configJson ?? skill.configJson,
    },
  });
}

export async function updateAiTool(id: number, data: any) {
  await ensureAiDefaults();

  const tool = await prisma.aiTool.findUnique({ where: { id } });
  if (!tool) throw new Error('AI tool not found');

  return prisma.aiTool.update({
    where: { id },
    data: {
      title: String(data.title || tool.title),
      enabled: typeof data.enabled === 'boolean' ? data.enabled : tool.enabled,
      riskLevel: typeof data.riskLevel === 'string' ? data.riskLevel : tool.riskLevel,
      configJson: data.configJson ?? tool.configJson,
    },
  });
}
