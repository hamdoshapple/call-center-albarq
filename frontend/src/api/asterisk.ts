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


export interface AsteriskContactJson {
  raw: string;
  aor: string;
  user: string;
  host: string;
  transport: string;
  status: string;
  rtt: string;
}

export interface AsteriskEndpointJson {
  raw: string;
  endpoint: string;
  state: string;
  channels: string;
}

export interface AsteriskQueueJson {
  queue: string;
  calls: number;
  strategy: string;
  members: number;
  callers: number;
  raw: string;
}

export interface AsteriskChannelsJson {
  activeChannels: number;
  activeCalls: number;
  callsProcessed: number;
  raw: string;
}

export function getAsteriskContactsJson() {
  return api<AsteriskContactJson[]>('/asterisk/contacts-json');
}

export function getAsteriskEndpointsJson() {
  return api<AsteriskEndpointJson[]>('/asterisk/endpoints-json');
}

export function getAsteriskQueuesJson() {
  return api<AsteriskQueueJson[]>('/asterisk/queues-json');
}

export function getAsteriskChannelsJson() {
  return api<AsteriskChannelsJson>('/asterisk/channels-json');
}


export type AsteriskRawFileKey = 'pjsip' | 'extensions' | 'http' | 'manager' | 'rtp' | 'queues';

export interface AsteriskRawFile {
  key: AsteriskRawFileKey;
  path: string;
  content: string;
}

export function readAsteriskRawFile(file: AsteriskRawFileKey) {
  return api<AsteriskRawFile>(`/asterisk/raw/${file}`);
}

export function writeAsteriskRawFile(file: AsteriskRawFileKey, content: string) {
  return api<{ ok: boolean; backup: string; reload: string; result: AsteriskCliResult }>(`/asterisk/raw/${file}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export interface AsteriskSimpleRawSettings {
  discovered?: {
    endpointSection: string;
    authSection: string;
    aorSection: string;
    identifySection: string;
  };
  tg400: {
    endpoint: string;
    context: string;
    codecs: string;
    fromUser: string;
    fromDomain: string;
    callerId: string;
    identifyBy: string;
    match: string;
    maxContacts: string;
    qualifyFrequency: string;
    username: string;
    password: string;
    rewriteContact: string;
    forceRport: string;
    rtpSymmetric: string;
    directMedia: string;
  };
  global: {
    endpointIdentifierOrder: string;
  };
  http: {
    enabled: string;
    bindaddr: string;
    bindport: string;
  };
  rtp: {
    rtpstart: string;
    rtpend: string;
  };
}

export function getSimpleRawSettings() {
  return api<AsteriskSimpleRawSettings>('/asterisk/simple-raw-settings');
}

export function updateSimpleRawSettings(payload: AsteriskSimpleRawSettings) {
  return api<{ ok: boolean; backups: string }>('/asterisk/simple-raw-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
