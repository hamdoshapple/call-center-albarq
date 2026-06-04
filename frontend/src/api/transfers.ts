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

function mapTransfer(e: any): TransferRecord {
  let detail: any = {};
  try { detail = e.detail ? JSON.parse(e.detail) : {}; } catch { detail = {}; }

  return {
    id: String(e.id),
    callId: String(e.callId || ''),
    callerNumber: detail.callerNumber || detail.caller || '—',
    fromAgentId: detail.fromAgentId || e.actor || '',
    targetType: detail.targetType || 'agent',
    targetId: detail.targetId || '',
    targetLabel: detail.targetLabel || detail.target || e.detail || '—',
    type: detail.type || 'blind',
    status: detail.status || 'completed',
    timestamp: e.timestamp || new Date().toISOString(),
  } as TransferRecord;
}

export async function listTransfers() {
  const rows = await api<any[]>('/transfers');
  return rows.map(mapTransfer);
}
