import type { LiveCall, TransferRecord } from '@/types';

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
    try {
      const data = JSON.parse(text);
      const err = new Error(data.message || data.error || `API error ${res.status}`) as Error & { code?: string; status?: number };
      err.code = data.code;
      err.status = res.status;
      throw err;
    } catch {
      throw new Error(text || `API error ${res.status}`);
    }
  }

  return res.json() as Promise<T>;
}

type BackendLiveCall = {
  id: string;
  callerNumber: string;
  destinationNumber: string;
  direction: 'inbound' | 'outbound' | 'internal';
  status: LiveCall['status'];
  agentExtension?: string | null;
  queue?: string | null;
  line?: string | null;
  startedAt: string;
  durationSec: number;
  callerName?: string | null;
  subscriberId?: string | null;
  subscriber?: any | null;
  crm?: any | null;
};

function mapCall(c: BackendLiveCall): LiveCall {
  return {
    id: String(c.id),
    callerNumber: c.callerNumber || 'Unknown',
    callerName: c.callerName || (c.destinationNumber ? `إلى ${c.destinationNumber}` : undefined),
    simLineId: c.line || 'ASTERISK',
    queueId: c.queue || undefined,
    agentId: c.agentExtension || undefined,
    status: c.status || 'active',
    direction: c.direction || 'inbound',
    startedAt: c.startedAt || new Date().toISOString(),
    durationSec: Number(c.durationSec || 0),
    onHold: false,
    subscriberId: c.subscriberId || undefined,
    subscriber: c.subscriber || undefined,
    crm: c.crm || undefined,
  };
}

export async function listLiveCalls(): Promise<LiveCall[]> {
  const rows = await api<BackendLiveCall[]>('/calls/live');
  return rows.map(mapCall);
}

export async function answerCall(id: string) {
  return api('/asterisk/control/answer', {
    method: 'POST',
    body: JSON.stringify({ uniqueId: id }),
  });
}

export async function holdCall(id: string) {
  return api('/asterisk/control/hold', {
    method: 'POST',
    body: JSON.stringify({ uniqueId: id }),
  });
}

export async function unholdCall(id: string) {
  return api('/asterisk/control/unhold', {
    method: 'POST',
    body: JSON.stringify({ uniqueId: id }),
  });
}

export async function hangupCall(id: string) {
  return api('/asterisk/control/hangup', {
    method: 'POST',
    body: JSON.stringify({ uniqueId: id }),
  });
}

export async function addCallNote(id: string, note: string) {
  return api(`/calls/${id}/note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function transferCall(
  id: string,
  payload: { type: TransferRecord['type']; targetType: TransferRecord['targetType']; targetId: string; targetLabel: string; callerNumber?: string }
) {
  return api('/asterisk/control/transfer', {
    method: 'POST',
    body: JSON.stringify({
      uniqueId: id,
      target: payload.targetId,
      attended: payload.type === 'attended',
      transferType: payload.type,
      targetType: payload.targetType,
      targetLabel: payload.targetLabel,
      callerNumber: payload.callerNumber,
    }),
  });
}
