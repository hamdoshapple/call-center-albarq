import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function ensureDefaultReplyTemplates() {
  const defaults = [
    {
      key: 'internet_down_active',
      title: 'Internet Down - Active Subscriber',
      intent: 'internet_down',
      priority: 10,
      conditionsJson: { hasSubscriber: true, status: 'active' },
      template:
        'أهلاً {{customerName}}، تم استلام بلاغك. اشتراكك ظاهر لدينا فعال، وسيتم تحويل البلاغ للفريق المختص لمراجعة حالة الخدمة وتحديثك بعد التحقق.',
    },
    {
      key: 'internet_down_unknown_status',
      title: 'Internet Down - Unknown Status',
      intent: 'internet_down',
      priority: 20,
      conditionsJson: { hasSubscriber: true },
      template:
        'أهلاً {{customerName}}، تم استلام بلاغك. سنقوم بمراجعة حالة الاشتراك والخدمة ثم تحديثك بعد التحقق.',
    },
    {
      key: 'billing_debt_found',
      title: 'Billing - Debt Found',
      intent: 'billing',
      priority: 10,
      conditionsJson: { hasSubscriber: true, debtGt: 0 },
      template:
        'أهلاً {{customerName}}، حسب البيانات المتوفرة يوجد مبلغ مستحق قدره {{debt}} د.ع.',
    },
    {
      key: 'need_phone',
      title: 'Need Subscriber Phone',
      intent: 'general',
      priority: 999,
      conditionsJson: { hasSubscriber: false },
      template:
        'أهلاً بك، يرجى تزويدنا برقم الهاتف أو اسم المستخدم حتى نتمكن من التحقق من حالة الخدمة.',
    },
  ];

  for (const item of defaults) {
    await prisma.aiReplyTemplate.upsert({
      where: { key: item.key },
      create: item,
      update: {},
    });
  }
}

export async function listAiReplyTemplates() {
  await ensureDefaultReplyTemplates();
  return prisma.aiReplyTemplate.findMany({
    orderBy: [{ intent: 'asc' }, { priority: 'asc' }, { id: 'asc' }],
  });
}

export async function updateAiReplyTemplate(id: number, data: any) {
  return prisma.aiReplyTemplate.update({
    where: { id },
    data: {
      title: String(data.title || ''),
      intent: String(data.intent || ''),
      enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
      priority: Number(data.priority || 100),
      conditionsJson: data.conditionsJson || {},
      template: String(data.template || ''),
    },
  });
}

export function renderReplyTemplate(template: string, vars: Record<string, any>) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  }).replace(/\s+/g, ' ').trim();
}

function matchesConditions(conditions: any, ctx: any) {
  if (!conditions) return true;

  if (typeof conditions.hasSubscriber === 'boolean' && conditions.hasSubscriber !== Boolean(ctx.hasSubscriber)) {
    return false;
  }

  if (conditions.status && String(ctx.status || '') !== String(conditions.status)) {
    return false;
  }

  if (conditions.debtGt !== undefined && !(Number(ctx.debt || 0) > Number(conditions.debtGt))) {
    return false;
  }

  return true;
}

export async function findReplyTemplate(intent: string, ctx: any) {
  await ensureDefaultReplyTemplates();

  const templates = await prisma.aiReplyTemplate.findMany({
    where: { enabled: true, intent },
    orderBy: [{ priority: 'asc' }, { id: 'asc' }],
  });

  return templates.find((t) => matchesConditions(t.conditionsJson, ctx)) || null;
}

export async function createAiReplyTemplate(data: any) {
  const key = String(data.key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    || `template_${Date.now()}`;

  return prisma.aiReplyTemplate.create({
    data: {
      key,
      title: String(data.title || 'New Reply Template'),
      intent: String(data.intent || 'general'),
      enabled: data.enabled !== false,
      priority: Number(data.priority || 100),
      conditionsJson: data.conditionsJson || {},
      template: String(data.template || 'أهلاً {{customerName}}، تم استلام رسالتك وسيتم مراجعتها.'),
    },
  });
}
