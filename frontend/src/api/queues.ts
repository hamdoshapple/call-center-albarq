import type { Queue } from '@/types';

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

export type QueueInput = Omit<Queue, 'id' | 'createdAt' | 'stats'> & {
  stats?: Queue['stats'];
};

function toApi(input: Partial<QueueInput>) {
  return {
    name: input.name,
    number: input.number,
    strategy: input.strategy,
    maxWaitTime: input.maxWaitTime,
    musicOnHold: input.musicOnHold,
    announcement: input.announcement,
    missedBehavior: input.missedBehavior,
    departmentId: input.departmentId || null,
    agentIds: input.agentIds ?? [],
  };
}

function mapQueue(q: any): Queue {
  return {
    id: String(q.id),
    name: q.name || '',
    number: q.number || '',
    strategy: q.strategy || 'ringall',
    maxWaitTime: Number(q.maxWaitTime || 120),
    musicOnHold: q.musicOnHold || 'default',
    announcement: q.announcement || '',
    missedBehavior: q.missedBehavior || 'voicemail',
    departmentId: q.departmentId || '',
    agentIds: Array.isArray(q.agentIds) ? q.agentIds : [],
    stats: q.stats || {
      waiting: 0,
      answered: 0,
      abandoned: 0,
      avgWait: 0,
      serviceLevel: 100,
    },
    createdAt: q.createdAt || new Date().toISOString(),
  };
}

export async function listQueues() {
  const rows = await api<any[]>('/queues');
  return rows.map(mapQueue);
}

export async function createQueue(input: QueueInput) {
  const row = await api<any>('/queues', {
    method: 'POST',
    body: JSON.stringify(toApi(input)),
  });
  return mapQueue(row);
}

export async function updateQueue(id: string, patch: Partial<QueueInput>) {
  const row = await api<any>(`/queues/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(patch)),
  });
  return mapQueue(row);
}

export async function deleteQueue(id: string) {
  await api(`/queues/${id}`, { method: 'DELETE' });
  return { success: true };
}
