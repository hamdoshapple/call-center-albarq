import type { CallLog } from '@/types';

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

  return res.json() as Promise<T>;
}

export interface CallLogFilters {
  search?: string;
  agentId?: string;
  queueId?: string;
  direction?: CallLog['direction'];
  disposition?: CallLog['disposition'];
  from?: string;
  to?: string;
}

type BackendCallLog = {
  id: string;
  uniqueId?: string | null;
  callerNumber: string;
  destinationNumber: string;
  direction: CallLog['direction'];
  status?: string;
  disposition?: CallLog['disposition'] | null;
  agentId?: string | null;
  queueId?: string | null;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSec: number;
  talkTimeSec: number;
  waitTimeSec: number;
  recording?: { id: string } | null;
};

type BackendResponse = {
  total: number;
  page: number;
  pageSize: number;
  rows: BackendCallLog[];
};

function mapCallLog(r: BackendCallLog): CallLog {
  return {
    id: r.id,
    callerNumber: r.callerNumber,
    destinationNumber: r.destinationNumber,
    direction: r.direction,
    disposition: (r.disposition ?? 'no_answer') as CallLog['disposition'],
    agentId: r.agentId || undefined,
    queueId: r.queueId || undefined,
    startedAt: r.startedAt,
    answeredAt: r.answeredAt ?? '',
    endedAt: r.endedAt ?? '',
    durationSec: Number(r.durationSec || 0),
    talkTimeSec: Number(r.talkTimeSec || 0),
    waitTimeSec: Number(r.waitTimeSec || 0),
    ...(r.recording?.id ? { recordingId: r.recording.id } : {}),
  };
}

export async function listCallLogs(filters: CallLogFilters = {}) {
  const qs = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      qs.set(key, String(value));
    }
  });

  qs.set('pageSize', '100');

  const data = await api<BackendResponse>(`/calls?${qs.toString()}`);
  return data.rows.map(mapCallLog);
}

export async function getCallLog(id: string) {
  const rows = await listCallLogs();
  return rows.find((r) => r.id === id) ?? null;
}
