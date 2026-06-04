import type { Department } from '@/types';

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

export type DepartmentInput = Omit<Department, 'id' | 'createdAt'>;

const mapDepartment = (d: any): Department => ({
  id: String(d.id),
  name: d.name || '',
  nameEn: d.nameEn || d.name || '',
  description: d.description || '',
  color: d.color || '#0ea5e9',
  agentIds: Array.isArray(d.agentIds)
    ? d.agentIds
    : Array.isArray(d.agents)
      ? d.agents.map((a: any) => String(a.id))
      : [],
  createdAt: d.createdAt || new Date().toISOString(),
});

export async function listDepartments() {
  const rows = await api<any[]>('/departments');
  return rows.map(mapDepartment);
}

export async function createDepartment(input: DepartmentInput) {
  return mapDepartment(await api<any>('/departments', { method: 'POST', body: JSON.stringify(input) }));
}

export async function updateDepartment(id: string, patch: Partial<DepartmentInput>) {
  return mapDepartment(await api<any>(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(patch) }));
}

export async function deleteDepartment(id: string) {
  await api(`/departments/${id}`, { method: 'DELETE' });
  return { success: true };
}
