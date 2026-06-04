import type { AsteriskSettings } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AsteriskConnection {
  ami: 'connected' | 'disconnected';
  ari: 'connected' | 'disconnected';
  sip: 'registered' | 'unregistered';
  uptimeSec: number;
}

export function getAsteriskSettings() {
  return api<AsteriskSettings>('/asterisk/settings');
}

export function updateAsteriskSettings(patch: Partial<AsteriskSettings>) {
  return api<AsteriskSettings>('/asterisk/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function getConnectionStatus() {
  return api<AsteriskConnection>('/asterisk/status');
}

export function reloadConfig() {
  return api<{ success: boolean; reloadedAt?: string }>('/asterisk/reload', {
    method: 'POST',
  });
}
