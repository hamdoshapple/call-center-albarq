export type AiProviderKey = 'ollama' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'qwen' | 'llama' | 'mistral' | string;

export type AiRunInput = {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  provider?: AiProviderKey;
};

export type AiRunResult = {
  text: string;
  confidence: number;
  latencyMs: number;
  raw?: unknown;
};
