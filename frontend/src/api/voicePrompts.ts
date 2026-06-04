import type { VoicePrompt } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export type VoicePromptInput = Omit<VoicePrompt, 'id' | 'uploadedAt'>;

const mapPrompt = (p: any): VoicePrompt => ({
  ...p,
  id: String(p.id),
  name: p.name || '',
  category: p.category || 'other',
  fileName: p.fileName || '',
  url: p.url || '',
  duration: Number(p.duration ?? p.durationSec ?? 0),
  language: p.language || 'ar',
  sizeKb: Number(p.sizeKb || 0),
  uploadedAt: p.uploadedAt || p.createdAt || new Date().toISOString(),
});

export async function listPrompts() {
  const rows = await api<any[]>('/voice-prompts');
  return rows.map(mapPrompt);
}

export async function createPrompt(input: VoicePromptInput) {
  return mapPrompt(await api<any>('/voice-prompts', { method: 'POST', body: JSON.stringify(input) }));
}

export async function updatePrompt(id: string, patch: Partial<VoicePromptInput>) {
  return mapPrompt(await api<any>(`/voice-prompts/${id}`, { method: 'PUT', body: JSON.stringify(patch) }));
}

export async function deletePrompt(id: string) {
  await api(`/voice-prompts/${id}`, { method: 'DELETE' });
  return { success: true };
}
