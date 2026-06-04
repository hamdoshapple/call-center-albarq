import type { Agent, AgentStatus } from '@/types';

const API_BASE = '/api';

function token() {
  return localStorage.getItem('cc_token') || '';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export type AgentInput = Omit<Agent, 'id' | 'performance' | 'createdAt'> & {
  performance?: Agent['performance'];
};

function toApi(input: Partial<AgentInput>) {
  return {
    name: input.name,
    email: input.email,
    status: input.status,
    departmentId: input.departmentId || null,
    extension: input.extension,
    sipUsername: input.sipUsername,
    sipPassword: input.sipPassword,
    workFrom: input.workingHours?.from,
    workTo: input.workingHours?.to,
    workDays: input.workingHours?.days,
    queueIds: input.queues,
  };
}

function mapAgent(a: any): Agent {
  return {
    id: String(a.id),
    name: a.name || '',
    extension: a.extension || '',
    sipUsername: a.sipUsername || a.extension || '',
    sipPassword: a.sipPassword || '',
    email: a.email || '',
    departmentId: a.departmentId || '',
    status: (a.status || 'offline') as AgentStatus,
    queues: Array.isArray(a.queues) ? a.queues : [],
    workingHours: a.workingHours || { from: '09:00', to: '17:00', days: [0, 1, 2, 3, 4] },
    performance: a.performance || {
      callsHandled: 0,
      callsMissed: 0,
      avgHandleTime: 0,
      totalTalkTime: 0,
      satisfaction: 0,
      occupancy: 0,
    },
    createdAt: a.createdAt || new Date().toISOString(),
  };
}

export async function listAgents() {
  const rows = await api<any[]>('/agents');
  return rows.map(mapAgent);
}

export async function getAgent(id: string) {
  const row = await api<any>(`/agents/${id}`);
  return row ? mapAgent(row) : null;
}

export async function createAgent(input: AgentInput) {
  const row = await api<any>('/agents', {
    method: 'POST',
    body: JSON.stringify(toApi(input)),
  });
  return mapAgent(row);
}

export async function updateAgent(id: string, patch: Partial<AgentInput>) {
  const row = await api<any>(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(patch)),
  });
  return mapAgent(row);
}

export function setAgentStatus(id: string, status: AgentStatus) {
  return updateAgent(id, { status });
}

export async function deleteAgent(id: string) {
  await api(`/agents/${id}`, { method: 'DELETE' });
  return { success: true };
}
