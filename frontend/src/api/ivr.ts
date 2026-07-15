import type { IVRMenu } from '@/types';

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

export type IVRInput = Omit<IVRMenu, 'id' | 'createdAt'>;

const mapIVR = (m: any): IVRMenu => ({
  ...m,
  id: String(m.id),
  name: m.name || '',
  description: m.description || '',
  options: Array.isArray(m.options) ? m.options : [],
  createdAt: m.createdAt || new Date().toISOString(),
});

export async function listIVR() {
  const rows = await api<any[]>('/ivr');
  return rows.map(mapIVR);
}

export async function getIVR(id: string) {
  const rows = await listIVR();
  return rows.find((m) => m.id === id) ?? null;
}

export async function createIVR(input: IVRInput) {
  return mapIVR(await api<any>('/ivr', { method: 'POST', body: JSON.stringify(input) }));
}

export async function updateIVR(id: string, patch: Partial<IVRInput>) {
  return mapIVR(await api<any>(`/ivr/${id}`, { method: 'PUT', body: JSON.stringify(patch) }));
}

export async function deleteIVR(id: string) {
  await api(`/ivr/${id}`, { method: 'DELETE' });
  return { success: true };
}

export async function applyIVR(id: string) {
  return api(`/ivr/${id}/apply`, { method: 'POST' });
}
