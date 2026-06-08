import type { Recording } from '@/types';

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

export interface RecordingFilters {
  search?: string;
  agentId?: string;
  from?: string;
  to?: string;
}

function mapRecording(r: any): Recording {
  return {
    id: String(r.id),
    callId: String(r.callId || ''),
    callerNumber: r.callerNumber || '',
    agentId: r.agentId || '',
    fileName: r.fileName || '',
    url: `/api/recordings/${r.id}/audio`,
    durationSec: Number(r.durationSec || 0),
    sizeKb: Number(r.sizeKb || 0),
    recordedAt: r.recordedAt || new Date().toISOString(),
    subscriberId: r.subscriberId || '',
    subscriberName: r.subscriberName || '',
    queueName: r.queueName || '',
  } as Recording;
}

export async function listRecordings(filters: RecordingFilters = {}) {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, String(v));
  });

  const rows = await api<any[]>(`/recordings?${qs.toString()}`);
  return rows.map(mapRecording);
}

export async function getRecording(id: string) {
  const row = await api<any>(`/recordings/${id}`);
  return row ? mapRecording(row) : null;
}

export async function deleteRecording(id: string) {
  await api(`/recordings/${id}`, { method: 'DELETE' });
  return { success: true };
}
