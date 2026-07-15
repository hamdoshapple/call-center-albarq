export type AiPolicyResult = {
  allowed: boolean;
  action: 'send' | 'human_review' | 'block';
  confidence: number;
  reasons: string[];
};

const bannedPatterns = [
  /راح نجيك/i,
  /خلال\s+\d+\s*(دقيقة|ساعة)/i,
  /تم تعويضك/i,
  /تم الغاء/i,
  /تم إلغاء/i,
  /تم تغيير/i,
  /تم تخفيض/i,
  /تم تفعيل/i,
  /تم التجديد/i,
  /سنعوضك/i,
  /مجانا/i,
  /مجاناً/i,
];

const riskyKeywords = [
  'تعويض',
  'الغاء',
  'إلغاء',
  'خصم',
  'تخفيض',
  'استرجاع',
  'فلوس',
  'تحويل مبلغ',
  'تغيير باقة',
  'تجديد',
  'تفعيل',
];

export function evaluateAiReplyPolicy(input: {
  customerMessage?: string;
  reply: string;
  confidence?: number;
  replyType?: string;
  hasSubscriber?: boolean;
}) {
  const reasons: string[] = [];
  const reply = String(input.reply || '').trim();
  const customerMessage = String(input.customerMessage || '');
  const confidence = Number(input.confidence || 0);

  if (!reply) {
    return {
      allowed: false,
      action: 'block',
      confidence,
      reasons: ['الرد فارغ.'],
    } satisfies AiPolicyResult;
  }

  if (confidence < 0.75) {
    reasons.push('الثقة أقل من الحد المطلوب للإرسال التلقائي.');
  }

  if (!input.hasSubscriber) {
    reasons.push('لا توجد بيانات مشترك مؤكدة.');
  }

  for (const pattern of bannedPatterns) {
    if (pattern.test(reply)) {
      reasons.push('الرد يحتوي وعداً أو إجراءً غير مسموح للإرسال التلقائي.');
      break;
    }
  }

  if (riskyKeywords.some((x) => customerMessage.includes(x) || reply.includes(x))) {
    reasons.push('الرسالة أو الرد يحتوي موضوعاً حساساً يحتاج مراجعة موظف.');
  }

  if (reply.length > 700) {
    reasons.push('الرد طويل أكثر من اللازم للإرسال التلقائي.');
  }

  if (reasons.length) {
    return {
      allowed: false,
      action: 'human_review',
      confidence,
      reasons,
    } satisfies AiPolicyResult;
  }

  return {
    allowed: true,
    action: 'send',
    confidence,
    reasons: ['الرد آمن للإرسال التلقائي.'],
  } satisfies AiPolicyResult;
}
