import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  AsteriskAgentStatus,
  AsteriskConnectionStatus,
  AsteriskGateway,
  AsteriskLiveCall,
  OriginateParams,
} from './types.js';

const CALLERS = ['07701234567', '07809876543', '07712223344', '07905556677', '07733445566'];
const QUEUES = ['2000', '2001', '2002'];
const AGENTS = ['1001', '1002', '1003', '1004', '1005', '1006'];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * In-process Asterisk simulator. Generates a realistic stream of live-call and
 * agent-status events so the whole stack (Socket.IO, dashboard, live calls) works
 * without a real PBX. Safe for public demo — no credentials, no external connections.
 */
export class MockAsteriskGateway extends EventEmitter implements AsteriskGateway {
  readonly mode = 'mock' as const;
  private calls = new Map<string, AsteriskLiveCall>();
  private agents = new Map<string, AsteriskAgentStatus>();
  private timer?: NodeJS.Timeout;
  private startedAt = Date.now();

  async connect(): Promise<void> {
    for (const ext of AGENTS) {
      this.agents.set(ext, { extension: ext, status: rand(['online', 'online', 'busy', 'paused']), inCall: false });
    }
    // Seed a couple of active calls.
    for (let i = 0; i < 3; i++) this.spawnCall();
    this.timer = setInterval(() => this.tick(), 4000);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async getConnectionStatus(): Promise<AsteriskConnectionStatus> {
    return {
      mode: 'mock',
      ami: 'connected',
      ari: 'connected',
      sip: 'registered',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  async getLiveCalls(): Promise<AsteriskLiveCall[]> {
    return [...this.calls.values()];
  }

  async getAgentStatuses(): Promise<AsteriskAgentStatus[]> {
    return [...this.agents.values()];
  }

  async originate(params: OriginateParams): Promise<{ uniqueId: string }> {
    const uniqueId = randomUUID();
    const call: AsteriskLiveCall = {
      uniqueId,
      callerNumber: params.callerId ?? params.fromExtension,
      destinationNumber: params.toNumber,
      direction: 'outbound',
      status: 'ringing',
      agentExtension: params.fromExtension,
      startedAt: new Date().toISOString(),
      durationSec: 0,
    };
    this.calls.set(uniqueId, call);
    this.emit('call:new', call);
    return { uniqueId };
  }

  async answer(uniqueId: string): Promise<void> {
    this.updateCall(uniqueId, { status: 'active' });
  }

  async hangup(uniqueId: string): Promise<void> {
    const call = this.calls.get(uniqueId);
    if (!call) return;
    this.calls.delete(uniqueId);
    if (call.agentExtension) this.setAgent(call.agentExtension, { inCall: false });
    this.emit('call:end', { ...call, status: 'ended' });
  }

  async hold(uniqueId: string): Promise<void> {
    this.updateCall(uniqueId, {});
    this.emit('call:update', { ...this.calls.get(uniqueId), held: true });
  }

  async unhold(uniqueId: string): Promise<void> {
    this.updateCall(uniqueId, {});
  }

  async transfer(uniqueId: string, target: string): Promise<void> {
    this.updateCall(uniqueId, { agentExtension: target });
  }

  async reloadConfig(): Promise<{ success: boolean; reloadedAt: string }> {
    return { success: true, reloadedAt: new Date().toISOString() };
  }

  // ---- internals ----
  private updateCall(uniqueId: string, patch: Partial<AsteriskLiveCall>) {
    const call = this.calls.get(uniqueId);
    if (!call) return;
    const updated = { ...call, ...patch };
    this.calls.set(uniqueId, updated);
    this.emit('call:update', updated);
  }

  private setAgent(extension: string, patch: Partial<AsteriskAgentStatus>) {
    const agent = this.agents.get(extension);
    if (!agent) return;
    const updated = { ...agent, ...patch };
    this.agents.set(extension, updated);
    this.emit('agent:update', updated);
  }

  private spawnCall() {
    const uniqueId = randomUUID();
    const agentExtension = rand(AGENTS);
    const call: AsteriskLiveCall = {
      uniqueId,
      callerNumber: rand(CALLERS),
      destinationNumber: rand(QUEUES),
      direction: 'inbound',
      status: rand(['ringing', 'waiting', 'active', 'active']),
      agentExtension,
      queue: rand(QUEUES),
      line: `gsm-${1 + Math.floor(Math.random() * 4)}`,
      startedAt: new Date().toISOString(),
      durationSec: 0,
    };
    this.calls.set(uniqueId, call);
    if (call.status === 'active') this.setAgent(agentExtension, { inCall: true, status: 'busy' });
    this.emit('call:new', call);
  }

  private tick() {
    // Advance call durations and randomly progress / end calls.
    for (const call of this.calls.values()) {
      call.durationSec += 4;
      if (call.status === 'ringing' && Math.random() > 0.5) {
        this.updateCall(call.uniqueId, { status: 'active' });
        if (call.agentExtension) this.setAgent(call.agentExtension, { inCall: true, status: 'busy' });
      } else if (call.status === 'active' && Math.random() > 0.7) {
        void this.hangup(call.uniqueId);
      } else {
        this.emit('call:update', call);
      }
    }
    // Occasionally spawn a new call (cap concurrency).
    if (this.calls.size < 6 && Math.random() > 0.4) this.spawnCall();
    // Randomly flip an idle agent's status.
    if (Math.random() > 0.7) {
      const ext = rand(AGENTS);
      const a = this.agents.get(ext);
      if (a && !a.inCall) this.setAgent(ext, { status: rand(['online', 'paused', 'online']) });
    }
  }
}
