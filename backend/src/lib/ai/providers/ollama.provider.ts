import { AiRunInput, AiRunResult } from '../ai-types.js';

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';

async function ollamaFetch(path: string, init?: RequestInit) {
  const url = `${DEFAULT_OLLAMA_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${body}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOllamaModels() {
  const res = await ollamaFetch('/api/tags');
  const data = await res.json() as any;
  return Array.isArray(data.models) ? data.models : [];
}

export async function runOllama(input: AiRunInput): Promise<AiRunResult> {
  const started = Date.now();

  const prompt = [
    input.systemPrompt ? `SYSTEM:\n${input.systemPrompt}` : '',
    `USER:\n${input.prompt}`,
  ].filter(Boolean).join('\n\n');

  const res = await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model || 'gemma3:4b',
      prompt,
      stream: false,
    }),
  });

  const data = await res.json() as any;

  return {
    text: String(data.response || ''),
    confidence: 0.7,
    latencyMs: Date.now() - started,
    raw: data,
  };
}
