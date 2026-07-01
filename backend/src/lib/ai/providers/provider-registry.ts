import { AiRunInput, AiRunResult } from '../ai-types.js';
import { listOllamaModels, runOllama } from './ollama.provider.js';

export async function listProviderModels(provider: string) {
  if (provider === 'ollama') return listOllamaModels();
  return [];
}

export async function runProvider(input: AiRunInput): Promise<AiRunResult> {
  const provider = input.provider || 'ollama';

  if (provider === 'ollama') {
    return runOllama(input);
  }

  throw new Error(`AI provider is not implemented yet: ${provider}`);
}
