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

  try {
    const result = await runProvider({
      provider: settings.provider,
      model: skill.modelName || settings.model,
      prompt: fullInput,
      systemPrompt,
    });

    const structured = enforceAiSafety(safeParseAiResponse(result.text));

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
