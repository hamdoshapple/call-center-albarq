import { PrismaClient } from '@prisma/client';
import { runAiTool } from './ai-tools/tool-engine.service.js';
import { evaluateAiReplyPolicy } from './ai-runtime/policy-engine.service.js';

const prisma = new PrismaClient();

function normalizePhone(value: unknown) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('964')) phone = '0' + phone.slice(3);
  if (!phone.startsWith('0') && phone.length === 10) phone = '0' + phone;
  return phone;
}

export async function getOrCreateAiConversation(input: {
  channel: string;
  externalKey?: string;
  customerPhone?: string;
  customerName?: string;
  metaJson?: any;
}) {
  const phone = normalizePhone(input.customerPhone);
  const externalKey = input.externalKey || (phone ? `${input.channel}:${phone}` : undefined);

  const existing = externalKey
    ? await prisma.aiConversation.findFirst({
        where: { channel: input.channel, externalKey },
      })
    : null;

  if (existing) return existing;

  return prisma.aiConversation.create({
    data: {
      channel: input.channel,
      externalKey,
      customerPhone: phone || null,
      customerName: input.customerName || null,
      metaJson: input.metaJson || undefined,
    },
  });
}

export async function addAiConversationMessage(input: {
  conversationId: number;
  role: string;
  content: string;
  source?: string;
  direction?: string;
  aiGenerated?: boolean;
  confidence?: number;
  metaJson?: any;
}) {
  return prisma.aiConversationMessage.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      source: input.source,
      direction: input.direction,
      aiGenerated: Boolean(input.aiGenerated),
      confidence: input.confidence,
      metaJson: input.metaJson || undefined,
    },
  });
}

export async function ingestAiConversationMessage(input: {
  channel: string;
  externalKey?: string;
  customerPhone?: string;
  customerName?: string;
  message: string;
  source?: string;
  metaJson?: any;
}) {
  const conversation = await getOrCreateAiConversation({
    channel: input.channel,
    externalKey: input.externalKey,
    customerPhone: input.customerPhone,
    customerName: input.customerName,
    metaJson: input.metaJson,
  });

  const message = await addAiConversationMessage({
    conversationId: conversation.id,
    role: 'customer',
    content: input.message,
    source: input.source || input.channel,
    direction: 'inbound',
    metaJson: input.metaJson,
  });

  let subscriberLookup: any = null;

  if (conversation.customerPhone) {
    try {
      const lookup = await runAiTool({
        toolKey: 'read_subscriber',
        source: 'conversation_engine',
        params: { phone: conversation.customerPhone },
      });

      subscriberLookup = lookup.result;
    } catch (err: any) {
      subscriberLookup = {
        found: false,
        error: err?.message || String(err),
      };
    }
  }

  const subscriber = subscriberLookup?.subscriber || null;

  const summaryParts = [
    input.message ? `آخر رسالة: ${input.message}` : '',
    subscriberLookup?.found ? `المشترك: ${subscriber?.name || 'غير معروف'}` : '',
    subscriberLookup?.found ? `الحالة: ${subscriber?.status || 'غير معروفة'}` : '',
    subscriberLookup?.found ? `الباقة: ${subscriber?.package || 'غير معروفة'}` : '',
    subscriberLookup?.found ? `الدين: ${Number(subscriber?.debt || 0).toLocaleString('en-US')} د.ع` : '',
  ].filter(Boolean);

  const updated = await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      customerName: subscriber?.name || conversation.customerName,
      subscriberJson: subscriberLookup || undefined,
      intent: detectIntent(input.message),
      stage: subscriberLookup?.found ? 'subscriber_resolved' : 'waiting_subscriber_lookup',
      lastSummary: summaryParts.join('\n'),
      updatedAt: new Date(),
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  return {
    conversation: updated,
    message,
    subscriberLookup,
  };
}

function detectIntent(text: string) {
  const t = String(text || '').toLowerCase();
  if (t.includes('مقطوع') || t.includes('ماكو نت') || t.includes('لا يعمل')) return 'internet_down';
  if (t.includes('ضعيف') || t.includes('بطيء')) return 'slow_internet';
  if (t.includes('دين') || t.includes('حساب') || t.includes('كم علي')) return 'billing';
  if (t.includes('تجديد') || t.includes('افعل')) return 'renewal';
  return 'general';
}

export async function listAiConversations() {
  return prisma.aiConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getAiConversation(id: number) {
  return prisma.aiConversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export async function decideAiConversationReply(conversationId: number) {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 20,
      },
    },
  });

  if (!conversation) {
    throw new Error('AI conversation not found');
  }

  const subscriber: any = conversation.subscriberJson as any;
  const sub = subscriber?.subscriber || null;
  const lastCustomerMessage = [...conversation.messages].reverse().find((m) => m.role === 'customer');

  if (!lastCustomerMessage) {
    throw new Error('No customer message found');
  }

  const riskyWords = ['تعويض', 'الغاء', 'إلغاء', 'خصم', 'تخفيض', 'فلوس', 'ارجاع', 'استرجاع', 'شكوى رسمية'];
  const text = lastCustomerMessage.content || '';
  const isRisky = riskyWords.some((w) => text.includes(w));

  const hasSubscriber = Boolean(subscriber?.found && sub);
  const status = String(sub?.status || '');
  const debt = Number(sub?.debt || 0);

  let decision = {
    shouldReply: false,
    replyType: 'human_review',
    confidence: 0.4,
    reason: 'تحتاج مراجعة موظف.',
    suggestedReply: 'تم استلام رسالتك، سيتم مراجعتها من قبل فريق الدعم.',
    handoffRequired: true,
  };

  if (isRisky) {
    decision = {
      shouldReply: false,
      replyType: 'handoff',
      confidence: 0.95,
      reason: 'الرسالة تحتوي طلباً حساساً مالياً أو إدارياً ويجب تحويلها لموظف.',
      suggestedReply: 'تم استلام طلبك، سيتم تحويله إلى الموظف المختص للمراجعة.',
      handoffRequired: true,
    };
  } else if (!hasSubscriber) {
    decision = {
      shouldReply: true,
      replyType: 'auto_reply',
      confidence: 0.85,
      reason: 'لم يتم العثور على بيانات مشترك مؤكدة، الرد الآمن هو طلب رقم الهاتف أو بيانات الحساب.',
      suggestedReply: 'أهلاً بك، يرجى تزويدنا برقم الهاتف أو اسم المستخدم حتى نتمكن من التحقق من حالة الخدمة.',
      handoffRequired: false,
    };
  } else if (conversation.intent === 'internet_down' || conversation.intent === 'slow_internet') {
    decision = {
      shouldReply: true,
      replyType: 'auto_reply',
      confidence: 0.9,
      reason: 'تم التعرف على المشترك والرسالة تخص مشكلة إنترنت، والرد المقترح آمن ولا يحتوي وعداً أو إجراءً حساساً.',
      suggestedReply:
        status === 'active'
          ? `أهلاً ${conversation.customerName || ''}، تم استلام بلاغك. اشتراكك ظاهر لدينا فعال، وسيتم فحص حالة الخدمة والجلسة من قبل الفريق المختص وتحديثك بعد التحقق.`
          : `أهلاً ${conversation.customerName || ''}، تم استلام بلاغك. سنقوم بمراجعة حالة الاشتراك والخدمة ثم تحديثك بعد التحقق.`,
      handoffRequired: false,
    };
  } else if (conversation.intent === 'billing') {
    decision = {
      shouldReply: true,
      replyType: 'auto_reply',
      confidence: 0.88,
      reason: 'طلب معلومات حساب/دين والبيانات متوفرة من النظام.',
      suggestedReply:
        debt > 0
          ? `أهلاً ${conversation.customerName || ''}، حسب البيانات المتوفرة يوجد مبلغ مستحق قدره ${debt.toLocaleString('en-US')} د.ع.`
          : `أهلاً ${conversation.customerName || ''}، لا يظهر لدينا مبلغ مستحق حالياً حسب البيانات المتوفرة.`,
      handoffRequired: false,
    };
  }

  const policy = evaluateAiReplyPolicy({
    customerMessage: text,
    reply: decision.suggestedReply,
    confidence: decision.confidence,
    replyType: decision.replyType,
    hasSubscriber,
  });

  const finalDecision = {
    ...decision,
    policy,
    shouldReply: decision.shouldReply && policy.allowed,
    replyType: policy.allowed ? decision.replyType : policy.action,
    handoffRequired: decision.handoffRequired || !policy.allowed,
  };

  const aiMessage = await addAiConversationMessage({
    conversationId: conversation.id,
    role: 'ai',
    content: finalDecision.suggestedReply,
    source: 'conversation_decision_engine',
    direction: policy.allowed ? 'outbound_ready' : 'outbound_review',
    aiGenerated: true,
    confidence: finalDecision.confidence,
    metaJson: finalDecision,
  });

  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      handoffRequired: finalDecision.handoffRequired,
      stage: finalDecision.replyType,
      lastSummary: [
        conversation.lastSummary || '',
        `قرار AI: ${finalDecision.replyType}`,
        `الثقة: ${Math.round(finalDecision.confidence * 100)}%`,
        `السبب: ${finalDecision.reason}`,
        `Policy: ${finalDecision.policy.action}`,
      ].filter(Boolean).join('\n'),
    },
  });

  return {
    conversationId: conversation.id,
    decision: finalDecision,
    aiMessage,
  };
}
