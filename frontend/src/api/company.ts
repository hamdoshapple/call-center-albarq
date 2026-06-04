import type { CompanySettings } from '@/types';

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

export function getCompany() {
  return api<CompanySettings>('/company');
}

export function updateCompany(patch: Partial<CompanySettings>) {
  return api<CompanySettings>('/company', { method: 'PUT', body: JSON.stringify(patch) });
}
