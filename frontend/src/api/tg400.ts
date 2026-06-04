import type { TG400Line } from '@/types';

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

export type LineInput = Omit<TG400Line, 'id'>;

const mapLine = (l: any): TG400Line => ({
  id: String(l.id),
  slot: Number(l.slot || 0),
  number: l.number || '',
  carrier: l.carrier || '',
  status: l.status || 'no_sim',
  signal: Number(l.signal || 0),
  purpose: l.purpose || '',
  inboundRoute: l.inboundRoute || '-',
  outboundRoute: l.outboundRoute || '-',
  usage: l.usage || {
    calls: Number(l.usageCalls || 0),
    minutes: Number(l.usageMinutes || 0),
    cost: Number(l.usageCost || 0),
  },
  balance: Number(l.balance || 0),
});

export async function listLines() {
  const rows = await api<any[]>('/tg400');
  return rows.map(mapLine);
}

export async function createLine(input: LineInput) {
  return mapLine(await api<any>('/tg400', { method: 'POST', body: JSON.stringify(input) }));
}

export async function updateLine(id: string, patch: Partial<LineInput>) {
  return mapLine(await api<any>(`/tg400/${id}`, { method: 'PUT', body: JSON.stringify(patch) }));
}

export async function deleteLine(id: string) {
  await api(`/tg400/${id}`, { method: 'DELETE' });
  return { success: true };
}
