import { PrismaClient } from '@prisma/client';
import { runProvider } from '../lib/ai/providers/provider-registry.js';
import { buildJsonContractPrompt, enforceAiSafety, safeParseAiResponse } from '../lib/ai/core/ai-response-contract.js';
import { ensureAiDefaults } from './ai.service.js';

const prisma = new PrismaClient();

type RunSkillInput = {
  skillKey: string;
  input: string;
  context?: unknown;
};

export async function runAiSkill({ skillKey, input, context }: RunSkillInput) {
  await ensureAiDefaults();

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

  const rules = await prisma.aiRule.findMany({
    where: { enabled: true },
    orderBy: { id: 'asc' },
  });

  const systemPrompt = [
    'أنت Albarq AI داخل نظام Call Center Albarq.',
    'أنت مساعد داخلي للموظفين فقط.',
    'ممنوع إرسال أي رسالة للزبون أو تنفيذ أي عملية.',
    '',
    'PROMPT الخاص بالمهارة:',
    prompt.content,
    '',
    'RULES:',
    ...rules.map((r) => `- ${r.title}: ${r.content}`),
    '',
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
  const hasSubscriberStatus = Boolean((context as any)?.subscriberStatus);
  const hasRealDiagnosticContext =
    hasSubscriberStatus ||
    Boolean((context as any)?.pppoeStatus) ||
    Boolean((context as any)?.debt) ||
    Boolean((context as any)?.lastTickets) ||
    Boolean((context as any)?.lastCalls);

  if (isTicketAnalyzer && !hasRealDiagnosticContext) {
    const safeResult = {
      answer: 'المعلومات المتوفرة لا تكفي للتحقق من حالة الاشتراك أو تحديد سبب المشكلة.',
      confidence: 0.25,
      reason: 'تم ذكر اسم ورقم ومشكلة، لكن لا توجد بيانات مؤكدة من النظام عن المشترك أو الاشتراك أو الجلسة.',
      proposedActions: [
        'البحث عن المشترك بواسطة رقم الهاتف داخل النظام.',
        'التحقق من حالة الاشتراك والديون.',
        'فحص حالة PPPoE / Session إذا كانت متاحة.',
        'تحويل التكت للفحص الفني إذا لم تظهر بيانات كافية.'
      ],
      suggestedReply: 'تم استلام الملاحظة، سيتم التحقق من بيانات الاشتراك وحالة الخدمة من النظام ثم تحديث التكت بعد الفحص.',
      rawText: ''
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
