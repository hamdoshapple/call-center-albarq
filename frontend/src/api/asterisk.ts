import type { AsteriskSettings } from '@/types';
import { mock } from './client';
import { store } from './store';

export function getAsteriskSettings() {
  return mock(() => ({ ...store.asterisk }));
}

export function updateAsteriskSettings(patch: Partial<AsteriskSettings>) {
  store.asterisk = { ...store.asterisk, ...patch };
  return mock({ ...store.asterisk });
}

export interface AsteriskConnection {
  ami: 'connected' | 'disconnected';
  ari: 'connected' | 'disconnected';
  sip: 'registered' | 'unregistered';
  uptimeSec: number;
}

export function getConnectionStatus() {
  return mock<AsteriskConnection>({
    ami: 'connected',
    ari: 'connected',
    sip: 'registered',
    uptimeSec: 824_530,
  });
}

export function reloadConfig() {
  return mock({ success: true, reloadedAt: new Date().toISOString() });
}
