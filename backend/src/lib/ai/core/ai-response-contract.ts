export type AiStructuredResult = {
  answer: string;
  confidence: number;
  reason: string;
  proposedActions: string[];
  suggestedReply: string;
  rawText?: string;
};

export function safeParseAiResponse(text: string): AiStructuredResult {
  try {
    const parsed = JSON.parse(text);

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
    return {
      answer: text || 'المعلومات غير كافية.',
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
