export type AiStructuredResult = {
  answer: string;
  confidence: number;
  reason: string;
  proposedActions: string[];
  suggestedReply: string;
  rawText?: string;
};


export function safeParseAiResponse(text: string): AiStructuredResult {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    return {
      answer: String(parsed.answer || 'المعلومات غير كافية.'),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.3))),
      reason: String(parsed.reason || 'لم يتم توفير سبب كافٍ.'),
      proposedActions: Array.isArray(parsed.proposedActions)
        ? parsed.proposedActions.map(String)
        : ['مراجعة البيانات المتوفرة قبل اتخاذ أي إجراء.'],
      suggestedReply: String(parsed.suggestedReply || ''),
      rawText: text,
    };
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          answer: String(parsed.answer || 'المعلومات غير كافية.'),
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.3))),
          reason: String(parsed.reason || 'لم يتم توفير سبب كافٍ.'),
          proposedActions: Array.isArray(parsed.proposedActions)
            ? parsed.proposedActions.map(String)
            : ['مراجعة البيانات المتوفرة قبل اتخاذ أي إجراء.'],
          suggestedReply: String(parsed.suggestedReply || ''),
          rawText: text,
        };
      } catch {
        // fallback below
      }
    }

    return {
      answer: cleaned || 'المعلومات غير كافية.',
      confidence: 0.3,
      reason: 'تعذر قراءة الرد كـ JSON منظم، لذلك تم تخفيض الثقة.',
      proposedActions: ['إعادة التجربة بصياغة أوضح.', 'مراجعة إعدادات الـ Prompt.'],
      suggestedReply: '',
      rawText: text,
    };
  }
}


export function buildJsonContractPrompt() {
  return `
يجب أن يكون ردك JSON صالح فقط بدون Markdown وبدون شرح خارج JSON.

الشكل الإجباري:
{
  "answer": "النتيجة المختصرة",
  "confidence": 0.0,
  "reason": "سبب النتيجة",
  "proposedActions": ["إجراء مقترح 1", "إجراء مقترح 2"],
  "suggestedReply": "رد مقترح للموظف فقط وليس للإرسال التلقائي"
}

قواعد صارمة:
- لا تخمن.
- إذا كانت المعلومات ناقصة، اكتب: المعلومات غير كافية.
- لا ترسل أي شيء للزبون.
- لا تنفذ أي إجراء.
- الرد المقترح هو اقتراح داخلي فقط.
- confidence رقم بين 0 و 1.
`.trim();
}


export function enforceAiSafety(result: AiStructuredResult, context?: any): AiStructuredResult {
  const actions = [...(result.proposedActions || [])];

  const defaultActions = [
    'فحص هل المشكلة عامة أو على مشترك واحد.',
    'فحص حالة PPPoE / Session للمشترك.',
    'فحص قراءة ONU / Signal إذا كانت متاحة.',
    'مراجعة الراوتر أو طلب إعادة تشغيله بعد الفحص.',
    'تحويل التكت للفني إذا استمرت المشكلة.'
  ];

  for (const action of defaultActions) {
    if (actions.length >= 3) break;
    actions.push(action);
  }

  const safeReply = 'تم استلام الملاحظة، سيتم فحص حالة الخط والخدمة من قبل الفريق المختص، وسنقوم بتحديث التكت بعد التحقق.';

  let suggestedReply = result.suggestedReply || '';
  suggestedReply = suggestedReply
    .replace(/هل يمكنني[^؟?]*[؟?]?/g, '')
    .replace(/هل يمكنني مساعدتك[^؟?]*[؟?]?/g, '')
    .replace(/مرجعًا للموظف[:：]?/g, '')
    .replace(/تذكر الموظف/g, 'فحص الحالة')
    .trim();

  if (!suggestedReply || suggestedReply.includes('هل يمكنني') || suggestedReply.length < 20) {
    suggestedReply = safeReply;
  }

  const hasSubscriberStatus = Boolean(context?.subscriberStatus);
  const combined = `${result.answer || ''} ${result.reason || ''} ${suggestedReply}`;
  const mentionsActiveSubscription = combined.includes('اشتراك فعال') || combined.includes('المشترك فعال') || combined.includes('الاشتراك فعال');
  const isTemplateOutput =
    combined.includes('النتيجة المختصرة') ||
    combined.includes('إجراء مقترح') ||
    combined.includes('رد مقترح للموظف فقط') ||
    combined.includes('لا يوجد أي خطأ أو تفاصيل');
  const guessWords = ['انقطاع', 'عادة', 'بسبب مشكلة', 'السبب المحتمل', 'يجب التحقق من سلامة الاشتراك عبر الإنترنت'];

  const hasGuess = guessWords.some((w) => combined.includes(w)) || isTemplateOutput || (!hasSubscriberStatus && mentionsActiveSubscription);

  return {
    ...result,
    answer: hasGuess
      ? (hasSubscriberStatus
        ? 'المعلومات المتوفرة تشير إلى ضعف في الإنترنت مع اشتراك فعال، ولا تكفي لتحديد السبب.'
        : 'المعلومات المتوفرة لا تكفي للتحقق من حالة الاشتراك أو تحديد سبب المشكلة.')
      : result.answer,
    confidence: Math.min(Number(result.confidence || 0.3), hasGuess ? 0.55 : 0.65),
    reason: hasGuess
      ? (hasSubscriberStatus
        ? 'تم تخفيض الثقة لأن السبب غير مثبت من البيانات المتاحة.'
        : 'لا توجد بيانات مشترك مؤكدة في السياق، لذلك لا يمكن تأكيد حالة الاشتراك أو سبب الانقطاع.')
      : result.reason,
    proposedActions: hasGuess ? defaultActions.slice(0, 4) : actions,
    suggestedReply: hasGuess
      ? safeReply
      : suggestedReply
  };
}
