import type { TransferRecord } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export type TransferDetails = TransferRecord & {
  fromAgentName?: string;
  fromExtension?: string;
  targetAgentName?: string;
  targetExtension?: string;
  targetQueueName?: string;
  targetQueueNumber?: string;
  destinationNumber?: string;
};

function parseDetail(raw: unknown) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { targetLabel: raw };
  }
}

function mapTransfer(e: any): TransferDetails {
  const detail: any = parseDetail(e.detail);

  return {
    id: String(e.id),
    callId: String(e.callId || e.call?.id || ''),
    callerNumber: detail.callerNumber || e.call?.callerNumber || '—',
    destinationNumber: detail.destinationNumber || e.call?.destinationNumber || '',
    fromAgentId: detail.fromAgentId || e.call?.agentId || e.actor || '',
    fromAgentName: detail.fromAgentName || '',
    fromExtension: detail.fromExtension || '',
    targetType: detail.targetType || 'agent',
    targetId: detail.targetId || '',
    targetLabel:
      detail.targetLabel ||
      detail.targetAgentName ||
      detail.targetQueueName ||
      detail.target ||
      (typeof e.detail === 'string' && !e.detail.trim().startsWith('{') ? e.detail : '') ||
      '—',
    targetAgentName: detail.targetAgentName || '',
    targetExtension: detail.targetExtension || '',
    targetQueueName: detail.targetQueueName || '',
    targetQueueNumber: detail.targetQueueNumber || '',
    type: detail.type || (typeof e.detail === 'string' && e.detail.includes('حضور') ? 'attended' : 'blind'),
    status: detail.status || 'completed',
    timestamp: e.timestamp || new Date().toISOString(),
  } as TransferDetails;
}

export async function listTransfers() {
  const rows = await api<any[]>('/transfers');
  return rows.map(mapTransfer);
}
