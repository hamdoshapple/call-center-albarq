import type { LiveCall, TransferRecord } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export function listLiveCalls() {
  return mock(() => tick());
}

/** Advance live-call timers; called on each poll to simulate real-time motion. */
export function tick(): LiveCall[] {
  const now = Date.now();
  store.liveCalls = store.liveCalls.map((c) => {
    if (c.status === 'ended' || c.status === 'missed') return c;
    const durationSec = Math.max(0, Math.round((now - new Date(c.startedAt).getTime()) / 1000));
    return { ...c, durationSec };
  });
  return [...store.liveCalls];
}

function update(id: string, patch: Partial<LiveCall>) {
  const idx = store.liveCalls.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  store.liveCalls[idx] = { ...store.liveCalls[idx], ...patch };
  return store.liveCalls[idx];
}

export function answerCall(id: string, agentId?: string) {
  const call = store.liveCalls.find((c) => c.id === id);
  return mock(() =>
    update(id, {
      status: 'active',
      answeredAt: new Date().toISOString(),
      agentId: agentId ?? call?.agentId,
    })
  );
}

export function holdCall(id: string) {
  return mock(() => update(id, { onHold: true }));
}

export function unholdCall(id: string) {
  return mock(() => update(id, { onHold: false }));
}

export function hangupCall(id: string) {
  return mock(() => {
    update(id, { status: 'ended' });
    setTimeout(() => {
      store.liveCalls = store.liveCalls.filter((c) => c.id !== id);
    }, 1500);
    return store.liveCalls.find((c) => c.id === id) ?? null;
  });
}

export function addCallNote(id: string, note: string) {
  return mock(() => update(id, { note }));
}

export function transferCall(
  id: string,
  payload: { type: TransferRecord['type']; targetType: TransferRecord['targetType']; targetId: string; targetLabel: string }
) {
  const call = store.liveCalls.find((c) => c.id === id);
  const record: TransferRecord = {
    id: uid('tr'),
    callId: id,
    callerNumber: call?.callerNumber ?? 'unknown',
    fromAgentId: call?.agentId,
    type: payload.type,
    targetType: payload.targetType,
    targetId: payload.targetId,
    targetLabel: payload.targetLabel,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  store.transfers.unshift(record);
  if (payload.targetType === 'agent') update(id, { agentId: payload.targetId });
  return mock(record);
}
