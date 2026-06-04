import type { CallLog } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AgentPerformanceRow {
  agentId: string;
  name: string;
  extension: string;
  callsHandled: number;
  callsMissed: number;
  avgHandleTime: number;
  satisfaction: number;
  occupancy: number;
}

export interface QueuePerformanceRow {
  queueId: string;
  name: string;
  number: string;
  answered: number;
  abandoned: number;
  avgWait: number;
  serviceLevel: number;
}

export function getAgentPerformance() {
  return api<AgentPerformanceRow[]>('/reports/agents');
}

export function getQueuePerformance() {
  return api<QueuePerformanceRow[]>('/reports/queues');
}

export function getPeakHoursReport() {
  return api<any[]>('/reports/peak-hours');
}

function mapCall(r: any): CallLog {
  return {
    id: String(r.id),
    callerNumber: r.callerNumber || '',
    destinationNumber: r.destinationNumber || '',
    direction: r.direction || 'inbound',
    disposition: r.disposition || 'no_answer',
    agentId: r.agentId || '',
    queueId: r.queueId || '',
    startedAt: r.startedAt || new Date().toISOString(),
    answeredAt: r.answeredAt ?? '',
    endedAt: r.endedAt ?? '',
    durationSec: Number(r.durationSec || 0),
    talkTimeSec: Number(r.talkTimeSec || 0),
    waitTimeSec: Number(r.waitTimeSec || 0),
    recordingId: r.recording?.id || '',
  } as CallLog;
}

export async function getMissedCallsReport() {
  const rows = await api<any[]>('/reports/missed-calls');
  return rows.map(mapCall);
}

export function getCallbacksReport() {
  return api<any[]>('/reports/callbacks');
}
