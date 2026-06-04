import type { VoicePrompt } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type VoicePromptInput = Omit<VoicePrompt, 'id' | 'uploadedAt'>;

export function listPrompts() {
  return mock(() => [...store.prompts]);
}

export function createPrompt(input: VoicePromptInput) {
  const prompt: VoicePrompt = { ...input, id: uid('vp'), uploadedAt: new Date().toISOString() };
  store.prompts.unshift(prompt);
  return mock(prompt);
}

export function updatePrompt(id: string, patch: Partial<VoicePromptInput>) {
  const idx = store.prompts.findIndex((p) => p.id === id);
  if (idx === -1) return mock(null);
  store.prompts[idx] = { ...store.prompts[idx], ...patch };
  return mock(store.prompts[idx]);
}

export function deletePrompt(id: string) {
  store.prompts = store.prompts.filter((p) => p.id !== id);
  return mock({ success: true });
}
