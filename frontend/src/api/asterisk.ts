import type { AsteriskSettings } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AsteriskConnection {
  ami: 'connected' | 'disconnected';
  ari: 'connected' | 'disconnected';
  sip: 'registered' | 'unregistered';
  uptimeSec: number;
}

export function getAsteriskSettings() {
  return api<AsteriskSettings>('/asterisk/settings');
}

export function updateAsteriskSettings(patch: Partial<AsteriskSettings>) {
  return api<AsteriskSettings>('/asterisk/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function getConnectionStatus() {
  return api<AsteriskConnection>('/asterisk/status');
}

export function reloadConfig() {
  return api<{ success: boolean; reloadedAt?: string }>('/asterisk/reload', {
    method: 'POST',
  });
}


export interface AgentLiveStatus {
  extension: string;
  status: 'online' | 'offline' | 'busy' | 'paused';
  inCall: boolean;
}

export function listAgentStatuses() {
  return api<AgentLiveStatus[]>('/asterisk/agent-statuses');
}


export interface HeldCall {
  id: string;
  customerChannel: string;
  customerNumber?: string;
  agentExtension: string;
  heldAt: string;
}

export function listHeldCalls() {
  return api<HeldCall[]>('/asterisk/held-calls');
}

export interface AsteriskCliResult {
  command: string;
  stdout: string;
  stderr?: string;
}

export function getAsteriskContacts() {
  return api<AsteriskCliResult>('/asterisk/contacts');
}

export function getAsteriskEndpoints() {
  return api<AsteriskCliResult>('/asterisk/endpoints');
}

export function getAsteriskRegistrations() {
  return api<AsteriskCliResult>('/asterisk/registrations');
}

export function getAsteriskTransports() {
  return api<AsteriskCliResult>('/asterisk/transports');
}

export function getAsteriskPjsipSettings() {
  return api<AsteriskCliResult>('/asterisk/pjsip-settings');
}

export function getAsteriskChannels() {
  return api<AsteriskCliResult>('/asterisk/channels');
}

export function getAsteriskQueues() {
  return api<AsteriskCliResult>('/asterisk/queues');
}

export function reloadPjsip() {
  return api<AsteriskCliResult>('/asterisk/reload-pjsip', { method: 'POST' });
}

export function reloadDialplan() {
  return api<AsteriskCliResult>('/asterisk/reload-dialplan', { method: 'POST' });
}

export function runAsteriskCli(command: string) {
  return api<AsteriskCliResult>('/asterisk/cli', {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}
