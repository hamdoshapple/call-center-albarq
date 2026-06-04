import type { DashboardStats } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function getDashboardStats() {
  return api<DashboardStats>('/dashboard/stats');
}

export async function getCallSeries(_range: 'daily' | 'weekly' | 'monthly') {
  const rows = await api<any[]>('/reports/peak-hours');
  return rows.map((r) => ({
    label: r.label,
    calls: Number(r.calls || 0),
    answered: Number(r.answered || r.calls || 0),
    missed: Number(r.missed || 0),
  }));
}

export async function getCallsByDepartment() {
  const rows = await api<any[]>('/reports/queues');
  return rows.map((r, idx) => ({
    name: r.name || `Queue ${idx + 1}`,
    calls: Number(r.answered || 0),
    value: Number(r.answered || 0),
    color: ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5],
  }));
}

export function getPeakHours() {
  return api<any[]>('/reports/peak-hours');
}
