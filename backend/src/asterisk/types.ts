import type { EventEmitter } from 'node:events';

export interface AsteriskLiveCall {
  uniqueId: string;
  channel?: string;
  callerNumber: string;
  destinationNumber: string;
  direction: 'inbound' | 'outbound' | 'internal';
  status: 'ringing' | 'waiting' | 'active' | 'ended';
  agentExtension?: string;
  queue?: string;
  line?: string;
  startedAt: string;
  durationSec: number;
}

export interface AsteriskAgentStatus {
  extension: string;
  status: 'online' | 'offline' | 'busy' | 'paused';
  inCall: boolean;
}

export interface AsteriskParkedCall {
  parkingSpace: string;
  parkingLot?: string;
  channel?: string;
  parkerDialString?: string;
  callerNumber?: string;
  parkedAt: string;
}

export interface AsteriskConnectionStatus {
  mode: 'mock' | 'live';
  ami: 'connected' | 'disconnected';
  ari: 'connected' | 'disconnected';
  sip: 'registered' | 'unregistered';
  uptimeSec: number;
}

export interface OriginateParams {
  fromExtension: string;
  toNumber: string;
  callerId?: string;
}

/**
 * Abstraction over Asterisk control. Implemented by the in-process mock simulator
 * (demo mode) and by the AMI/ARI live gateway (production). The rest of the app
 * depends only on this interface, so switching to a real PBX requires no API changes.
 */
export interface AsteriskGateway extends EventEmitter {
  readonly mode: 'mock' | 'live';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionStatus(): Promise<AsteriskConnectionStatus>;

  // Read state
  getLiveCalls(): Promise<AsteriskLiveCall[]>;
  getAgentStatuses(): Promise<AsteriskAgentStatus[]>;
  getParkedCalls(): Promise<AsteriskParkedCall[]>;

  // Control actions
  originate(params: OriginateParams): Promise<{ uniqueId: string }>;
  answer(uniqueId: string): Promise<void>;
  hangup(uniqueId: string): Promise<void>;
  hold(uniqueId: string): Promise<void>;
  unhold(uniqueId: string): Promise<void>;
  retrieveParkedCall(parkingSpace: string, targetExtension: string): Promise<void>;
  transfer(uniqueId: string, target: string, attended?: boolean): Promise<void>;

  // Config management (safe reload)
  reloadConfig(): Promise<{ success: boolean; reloadedAt: string }>;
}

/** Events emitted by any gateway: 'call:new' | 'call:update' | 'call:end' | 'agent:update' */
export type AsteriskEvent = 'call:new' | 'call:update' | 'call:end' | 'agent:update';
