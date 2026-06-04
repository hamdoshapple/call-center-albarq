import { EventEmitter } from 'node:events';
import { env } from '../config/env.js';
import type {
  AsteriskAgentStatus,
  AsteriskConnectionStatus,
  AsteriskGateway,
  AsteriskLiveCall,
  OriginateParams,
} from './types.js';

/**
 * Live Asterisk gateway scaffold (AMI + ARI).
 *
 * This class defines exactly where real integration plugs in. It deliberately
 * does NOT open sockets by default so the project stays safe to run/publish
 * without a PBX. To enable, set ASTERISK_MODE=live and implement the marked
 * sections using a client such as `asterisk-manager` (AMI) and the ARI REST/WebSocket API.
 *
 * AMI (Asterisk Manager Interface): port 5038 — events + actions
 *   - Listen: Newchannel, Newstate, DialBegin/DialEnd, QueueCallerJoin, Hangup, Bridge
 *   - Actions: Originate, Hangup, Redirect (transfer), Hold (via Park/AMI), QueuePause
 * ARI (Asterisk REST Interface): port 8088 — fine-grained channel/bridge control
 *   - WebSocket /ari/events for StasisStart/StasisEnd, ChannelStateChange
 *   - REST /ari/channels for originate, answer, hold, mute, redirect, hangup
 */
export class LiveAsteriskGateway extends EventEmitter implements AsteriskGateway {
  readonly mode = 'live' as const;
  private connected = false;
  private startedAt = Date.now();

  async connect(): Promise<void> {
    // TODO(integration): open AMI TCP connection to env.asterisk.amiHost:amiPort,
    // login with amiUser/amiPassword, subscribe to events, and connect the ARI
    // WebSocket at ws://ariHost:ariPort/ari/events. Map incoming events to
    // this.emit('call:new' | 'call:update' | 'call:end' | 'agent:update', ...).
    if (!env.asterisk.amiPassword) {
      throw new Error(
        'Live Asterisk mode requires AMI/ARI credentials. Set AMI_PASSWORD/ARI_PASSWORD or use ASTERISK_MODE=mock.'
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getConnectionStatus(): Promise<AsteriskConnectionStatus> {
    return {
      mode: 'live',
      ami: this.connected ? 'connected' : 'disconnected',
      ari: this.connected ? 'connected' : 'disconnected',
      sip: this.connected ? 'registered' : 'unregistered',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  async getLiveCalls(): Promise<AsteriskLiveCall[]> {
    // TODO(integration): query ARI GET /ari/channels and map to AsteriskLiveCall.
    return [];
  }

  async getAgentStatuses(): Promise<AsteriskAgentStatus[]> {
    // TODO(integration): AMI QueueStatus / DeviceStateList → AsteriskAgentStatus.
    return [];
  }

  async originate(_params: OriginateParams): Promise<{ uniqueId: string }> {
    // TODO(integration): ARI POST /ari/channels (endpoint=PJSIP/<ext>, ...).
    throw new Error('originate not implemented in live mode yet');
  }

  async answer(_uniqueId: string): Promise<void> {
    throw new Error('answer not implemented in live mode yet');
  }

  async hangup(_uniqueId: string): Promise<void> {
    throw new Error('hangup not implemented in live mode yet');
  }

  async hold(_uniqueId: string): Promise<void> {
    throw new Error('hold not implemented in live mode yet');
  }

  async unhold(_uniqueId: string): Promise<void> {
    throw new Error('unhold not implemented in live mode yet');
  }

  async transfer(_uniqueId: string, _target: string, _attended?: boolean): Promise<void> {
    throw new Error('transfer not implemented in live mode yet');
  }

  async reloadConfig(): Promise<{ success: boolean; reloadedAt: string }> {
    // TODO(integration): AMI Action: Command "core reload" (or module-scoped reloads).
    throw new Error('reloadConfig not implemented in live mode yet');
  }
}
