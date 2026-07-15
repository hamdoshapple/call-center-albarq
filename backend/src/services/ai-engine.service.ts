import { PrismaClient } from '@prisma/client';
import { runProvider } from '../lib/ai/providers/provider-registry.js';
import { buildJsonContractPrompt, enforceAiSafety, safeParseAiResponse } from '../lib/ai/core/ai-response-contract.js';
import { ensureAiDefaults } from './ai.service.js';

const prisma = new PrismaClient();

type RunSkillInput = {
  skillKey: string;
  input: string;
  context?: any;
};

function extractPhoneFromText(text: string) {
  const normalized = String(text || '').replace(/[\s\-()]/g, '');
  const match = normalized.match(/(?:9647\d{9}|07\d{9})/);
  if (!match) return '';

  let phone = match[0].replace(/\D/g, '');
  if (phone.startsWith('964')) phone = '0' + phone.slice(3);
  return phone;
}

function normalizePhone(value: unknown) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('964')) phone = '0' + phone.slice(3);
  if (!phone.startsWith('0') && phone.length === 10) phone = '0' + phone;
  return phone;
}

async function enrichTicketContextWithSubscriber(input: string, context: any) {
  const senderPhone = normalizePhone(context?.senderPhone || context?.fromPhone || context?.phone);
  const textPhone = extractPhoneFromText(input);
  const phone = senderPhone || textPhone;

  if (!phone) {
    return context || {};
  }

  const { runAiTool } = await import('./ai-tools/tool-engine.service.js');

  try {
    const lookup = await runAiTool({
      toolKey: 'read_subscriber',
      source: 'ticket_analyzer_auto_context',
      params: { phone },
    });

    const subscriber = lookup?.result?.subscriber || null;

    return {
      ...(context || {}),
      phoneSource: senderPhone ? 'senderPhone' : 'text',
      phoneResolved: true,
      subscriberLookup: lookup.result,
      subscriberStatus: subscriber?.status || context?.subscriberStatus,
      subscriberDebt: subscriber?.debt,
      subscriberPackage: subscriber?.package,
      subscriberExpiration: subscriber?.expiration,
      subscriberDataSource: lookup?.result?.dataSource,
    };
  } catch (err: any) {
    return {
      ...(context || {}),
      phoneSource: senderPhone ? 'senderPhone' : 'text',
      phoneResolved: false,
      subscriberLookupError: err?.message || String(err),
    };
  }
}

export async function runAiSkill({ skillKey, input, context }: RunSkillInput) {
  await ensureAiDefaults();

  if (skillKey === 'ticket_analyzer') {
    context = await enrichTicketContextWithSubscriber(input, context || {});
  }

  const settings = await prisma.aiSetting.findUnique({ where: { id: 1 } });
  if (!settings?.enabled) {
    throw new Error('AI is disabled from AI Control Center.');
  }

  const skill = await prisma.aiSkill.findUnique({ where: { key: skillKey } });
  if (!skill) {
    throw new Error(`AI skill not found: ${skillKey}`);
  }

  if (!skill.enabled) {
    throw new Error(`AI skill is disabled: ${skillKey}`);
  }

  const prompt = skill.promptKey
    ? await prisma.aiPrompt.findUnique({ where: { key: skill.promptKey } })
    : null;

  if (!prompt?.enabled) {
    throw new Error(`AI prompt is disabled or missing for skill: ${skillKey}`);
  }

  const systemPrompt = [
    'Albarq AI داخلي فقط. لا ترسل للزبون ولا تنفذ إجراء.',
    'لا تخمن. إذا البيانات ناقصة قل: المعلومات غير كافية.',
    prompt.content,
    buildJsonContractPrompt(),
  ].join('\n');

  const fullInput = [
    `Skill: ${skill.title}`,
    '',
    'Input:',
    input,
    '',
    context ? `Context:\n${JSON.stringify(context, null, 2)}` : '',
  ].filter(Boolean).join('\n');

  const started = Date.now();

  const isTicketAnalyzer = skillKey === 'ticket_analyzer';
  const hasRealDiagnosticContext =
    Boolean(context?.subscriberStatus) ||
    Boolean(context?.subscriberLookup?.found) ||
    Boolean(context?.pppoeStatus) ||
    Boolean(context?.debt) ||
    Boolean(context?.lastTickets) ||
    Boolean(context?.lastCalls);

  if (isTicketAnalyzer && context?.subscriberLookup?.found) {
    const sub = context.subscriberLookup.subscriber || {};
    const safeResult = {
      answer: `تم العثور على المشترك من ${context.subscriberDataSource || 'النظام'}، حالة الاشتراك: ${sub.status || 'غير معروفة'}، الباقة: ${sub.package || 'غير معروفة'}، الدين: ${Number(sub.debt || 0).toLocaleString('en-US')} د.ع. لا توجد بيانات PPPoE/ONU حالياً لتحديد سبب الانقطاع بدقة.`,
      confidence: 0.75,
      reason: 'تم الاعتماد على بيانات مشترك مؤكدة من النظام، لكن سبب الانقطاع يحتاج بيانات جلسة أو فحص فني إضافي.',
      proposedActions: [
        'تأكيد حالة الاشتراك والديون مع المشترك.',
        'فحص حالة PPPoE / Session عند توفرها.',
        'التحقق هل المشكلة عامة أو على مشترك واحد.',
        'تحويل التكت للفحص الفني إذا استمر الانقطاع.'
      ],
      suggestedReply: 'تم استلام البلاغ، بيانات الاشتراك ظاهرة لدينا وسيتم فحص حالة الخدمة والجلسة ثم تحديث التكت بعد التحقق.',
      rawText: ''
    };

    await prisma.aiLog.create({
      data: {
        source: 'skill_fast_diagnostic',
        skillKey,
        provider: settings.provider,
        model: skill.modelName || settings.model,
        prompt: fullInput,
        response: JSON.stringify(safeResult),
        confidence: safeResult.confidence,
        latencyMs: Date.now() - started,
        success: true,
        metaJson: { fastDiagnostic: true, subscriberFound: true },
      },
    });

    return {
      skill: { key: skill.key, title: skill.title },
      provider: settings.provider,
      model: skill.modelName || settings.model,
      latencyMs: Date.now() - started,
      result: safeResult,
    };
  }

  if (isTicketAnalyzer && !hasRealDiagnosticContext) {
    const safeResult = {
      answer: 'المعلومات المتوفرة لا تكفي للتحقق من حالة الاشتراك أو تحديد سبب المشكلة.',
      confidence: 0.25,
      reason: 'تم ذكر مشكلة، لكن لا توجد بيانات مؤكدة من النظام عن المشترك أو الاشتراك أو الجلسة.',
      proposedActions: [
        'البحث عن المشترك بواسطة رقم الهاتف داخل النظام.',
        'التحقق من حالة الاشتراك والديون.',
        'فحص حالة PPPoE / Session إذا كانت متاحة.',
        'تحويل التكت للفحص الفني إذا لم تظهر بيانات كافية.',
      ],
      suggestedReply: 'تم استلام الملاحظة، سيتم التحقق من بيانات الاشتراك وحالة الخدمة من النظام ثم تحديث التكت بعد الفحص.',
      rawText: '',
    };

    await prisma.aiLog.create({
      data: {
        source: 'skill_fast_guard',
        skillKey,
        provider: settings.provider,
        model: skill.modelName || settings.model,
        prompt: fullInput,
        response: JSON.stringify(safeResult),
        confidence: safeResult.confidence,
        latencyMs: Date.now() - started,
        success: true,
        metaJson: { fastGuard: true, reason: 'missing_diagnostic_context' },
      },
    });

    return {
      skill: { key: skill.key, title: skill.title },
      provider: settings.provider,
      model: skill.modelName || settings.model,
      latencyMs: Date.now() - started,
      result: safeResult,
    };
  }

  try {
    const result = await runProvider({
      provider: settings.provider,
      model: skill.modelName || settings.model,
      prompt: fullInput,
      systemPrompt,
    });

    const structured = enforceAiSafety(safeParseAiResponse(result.text), context);

    await prisma.aiLog.create({
      data: {
        source: 'skill',
        skillKey,
        provider: settings.provider,
        model: skill.modelName || settings.model,
        prompt: fullInput,
        response: result.text,
        confidence: structured.confidence,
        latencyMs: result.latencyMs,
        success: true,
        metaJson: {
          structured,
          contextProvided: Boolean(context),
        },
      },
    });

    return {
      skill: {
        key: skill.key,
        title: skill.title,
      },
      provider: settings.provider,
      model: skill.modelName || settings.model,
      latencyMs: result.latencyMs,
      result: structured,
    };
  } catch (err: any) {
    await prisma.aiLog.create({
      data: {
        source: 'skill',
        skillKey,
        provider: settings.provider,
        model: skill.modelName || settings.model,
        prompt: fullInput,
        latencyMs: Date.now() - started,
        success: false,
        error: err?.message || String(err),
      },
    });

    throw err;
  }
}
