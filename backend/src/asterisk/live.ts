import { EventEmitter } from 'node:events';
import net from 'node:net';
import { env } from '../config/env.js';
import type {
  AsteriskAgentStatus,
  AsteriskConnectionStatus,
  AsteriskGateway,
  AsteriskLiveCall,
  OriginateParams,
} from './types.js';

type AmiEvent = Record<string, string>;

function parseAmiBlock(block: string): AmiEvent {
  const out: AmiEvent = {};
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function callStatusFromState(state?: string): AsteriskLiveCall['status'] {
  if (!state) return 'active';
  if (/ring/i.test(state)) return 'ringing';
  if (/down/i.test(state)) return 'waiting';
  if (/up/i.test(state)) return 'active';
  return 'active';
}


function isRealPhone(v?: string): boolean {
  return !!(v || '').match(/07\d{9,10}|\+?964\d{10}/);
}

function bestCallerNumber(...values: Array<string | undefined>): string {
  for (const raw of values) {
    const v = (raw || '').trim();
    if (!v || v === '<unknown>' || v === 'unknown') continue;

    const quoted = v.match(/"([^"]+)"/)?.[1];
    const candidate = quoted || v;

    const phone = candidate.match(/07\d{9,10}|\+?964\d{10}/)?.[0];
    if (phone) return phone;
  }

  for (const raw of values) {
    const v = (raw || '').trim();
    if (v && v !== '<unknown>' && v !== 'unknown') return v;
  }

  return 'Unknown';
}

export class LiveAsteriskGateway extends EventEmitter implements AsteriskGateway {
  readonly mode = 'live' as const;

  private socket?: net.Socket;
  private buffer = '';
  private connected = false;
  private loggedIn = false;
  private startedAt = Date.now();

  private calls = new Map<string, AsteriskLiveCall>();
  private agents = new Map<string, AsteriskAgentStatus>();
  private pending = new Map<string, (ev: AmiEvent) => void>();
  private reconnectTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;

  async connect(): Promise<void> {
    await this.openSocket();
    this.pollTimer = setInterval(() => {
      void this.refreshContacts();
      void this.refreshChannels();
    }, 4000);
    await this.refreshContacts();
    await this.refreshChannels();
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.socket?.destroy();
    this.connected = false;
    this.loggedIn = false;
  }

  async getConnectionStatus(): Promise<AsteriskConnectionStatus> {
    return {
      mode: 'live',
      ami: this.loggedIn ? 'connected' : 'disconnected',
      ari: 'disconnected',
      sip: this.loggedIn ? 'registered' : 'unregistered',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  async getLiveCalls(): Promise<AsteriskLiveCall[]> {
    await this.refreshChannels();
    return [...this.calls.values()];
  }

  async getAgentStatuses(): Promise<AsteriskAgentStatus[]> {
    await this.refreshContacts();
    return [...this.agents.values()];
  }

  async originate(params: OriginateParams): Promise<{ uniqueId: string }> {
    const resp = await this.action({
      Action: 'Originate',
      Channel: `PJSIP/${params.fromExtension}`,
      Exten: params.toNumber,
      Context: 'internal',
      Priority: '1',
      CallerID: params.callerId ?? params.fromExtension,
      Async: 'true',
    });
    return { uniqueId: resp.Uniqueid || resp.ActionID || Date.now().toString() };
  }

  async answer(_uniqueId: string): Promise<void> {
    throw new Error('Answer is not supported by AMI for an already-routed channel');
  }

  async hangup(uniqueId: string): Promise<void> {
    const call = this.calls.get(uniqueId);
    await this.action({
      Action: 'Hangup',
      Channel: call?.channel || uniqueId,
    });
  }

  async hold(_uniqueId: string): Promise<void> {
    throw new Error('Hold not implemented yet');
  }

  async unhold(_uniqueId: string): Promise<void> {
    throw new Error('Unhold not implemented yet');
  }

  async transfer(uniqueId: string, target: string): Promise<void> {
    await this.refreshChannels();

    const call =
      this.calls.get(uniqueId) ||
      [...this.calls.values()].find((c) => c.channel === uniqueId || c.uniqueId === uniqueId);

    const fallbackCall = call || [...this.calls.values()][0];

    if (!fallbackCall?.channel) {
      throw new Error(`Channel not found for transfer: ${uniqueId}`);
    }

    const resp = await this.action({
      Action: 'Redirect',
      Channel: fallbackCall.channel,
      Context: 'internal',
      Exten: target,
      Priority: '1',
    });

    if (!/success/i.test(resp.Response || '')) {
      throw new Error(resp.Message || `Transfer failed to ${target}`);
    }

    await this.refreshChannels();
  }

  async reloadConfig(): Promise<{ success: boolean; reloadedAt: string }> {
    await this.action({ Action: 'Command', Command: 'pjsip reload' });
    await this.action({ Action: 'Command', Command: 'dialplan reload' });
    return { success: true, reloadedAt: new Date().toISOString() };
  }

  private async openSocket(): Promise<void> {
    if (this.connected && this.loggedIn) return;

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        {
          host: env.asterisk.amiHost,
          port: env.asterisk.amiPort,
        },
        () => {
          this.socket = socket;
          this.connected = true;
          this.login()
            .then(resolve)
            .catch(reject);
        }
      );

      socket.setEncoding('utf8');

      socket.on('data', (chunk) => this.onData(chunk.toString()));

      socket.on('error', (err) => {
        this.connected = false;
        this.loggedIn = false;
        this.scheduleReconnect();
        reject(err);
      });

      socket.on('close', () => {
        this.connected = false;
        this.loggedIn = false;
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket().catch(() => undefined);
    }, 5000);
  }

  private async login(): Promise<void> {
    const resp = await this.action({
      Action: 'Login',
      Username: env.asterisk.amiUser,
      Secret: env.asterisk.amiPassword,
      Events: 'on',
    });
    if (!/success/i.test(resp.Response || '')) {
      throw new Error(resp.Message || 'AMI login failed');
    }
    this.loggedIn = true;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\r\n\r\n')) >= 0) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 4);
      const ev = parseAmiBlock(raw);
      this.handleAmi(ev);
    }
  }

  private handleAmi(ev: AmiEvent) {
    const actionId = ev.ActionID;
    if (actionId && this.pending.has(actionId)) {
      const cb = this.pending.get(actionId)!;
      this.pending.delete(actionId);
      cb(ev);
      return;
    }

    switch (ev.Event) {
      case 'Newchannel':
      case 'Newstate':
      case 'DialBegin':
      case 'BridgeEnter':
        this.upsertCall(ev);
        break;
      case 'Hangup':
        this.endCall(ev);
        break;
      case 'ContactStatus':
      case 'PeerStatus':
        this.upsertAgent(ev);
        break;
    }
  }

  private upsertCall(ev: AmiEvent) {
    if (ev.Event === 'Newchannel' || ev.Event === 'Newstate') {
      console.log('[AMI CALLER]', {
        Event: ev.Event,
        Channel: ev.Channel,
        CallerIDName: ev.CallerIDName,
        CallerIDNum: ev.CallerIDNum,
        CallerID: ev.CallerID,
        ConnectedLineName: ev.ConnectedLineName,
        ConnectedLineNum: ev.ConnectedLineNum,
      });
    }
    const uniqueId = ev.Uniqueid || ev.UniqueID || ev.Linkedid || ev.Channel;
    if (!uniqueId) return;

    const existing = this.calls.get(uniqueId);
    const channel = ev.Channel || existing?.channel || '';

    const callerNumber = bestCallerNumber(
      ev.CallerIDName,
      ev.ConnectedLineName,
      ev.CallerIDNum,
      ev.CallerID,
      existing?.callerNumber
    );

    const destinationNumber =
      ev.Exten ||
      ev.DestExten ||
      ev.ConnectedLineNum ||
      existing?.destinationNumber ||
      'unknown';

    const agentMatch = `${channel} ${ev.DestChannel || ''}`.match(/PJSIP\/(\d+)/);
    const agentExtension = agentMatch?.[1] || existing?.agentExtension;

    const call: AsteriskLiveCall = {
      uniqueId,
      channel,
      callerNumber,
      destinationNumber,
      direction: existing?.direction || 'inbound',
      status: callStatusFromState(ev.ChannelStateDesc || ev.DialStatus),
      agentExtension,
      queue: existing?.queue,
      line: channel.includes('20001') || (ev.DestChannel || '').includes('20001') ? 'TG400-20001' : existing?.line,
      startedAt: existing?.startedAt || new Date().toISOString(),
      durationSec: existing ? Math.floor((Date.now() - new Date(existing.startedAt).getTime()) / 1000) : 0,
    };

    this.calls.set(uniqueId, call);
    this.emit(existing ? 'call:update' : 'call:new', call);
  }

  private endCall(ev: AmiEvent) {
    const uniqueId = ev.Uniqueid || ev.UniqueID || ev.Linkedid || ev.Channel;
    if (!uniqueId) return;
    const existing = this.calls.get(uniqueId);
    if (!existing) return;
    this.calls.delete(uniqueId);
    this.emit('call:end', { ...existing, status: 'ended' });
  }

  private upsertAgent(ev: AmiEvent) {
    const raw = ev.EndpointName || ev.Peer || ev.ObjectName || ev.Contact || '';
    const m = raw.match(/(\d+)/);
    if (!m) return;

    const statusText = ev.ContactStatus || ev.PeerStatus || ev.Status || '';
    const agent: AsteriskAgentStatus = {
      extension: m[1],
      status: /reachable|registered|ok/i.test(statusText) ? 'online' : 'offline',
      inCall: false,
    };
    this.agents.set(agent.extension, agent);
    this.emit('agent:update', agent);
  }

  private async refreshContacts(): Promise<void> {
    if (!this.loggedIn) return;
    const resp = await this.action({ Action: 'Command', Command: 'pjsip show contacts' });
    const output = resp.Output || '';
    for (const line of output.split('\n')) {
      const m = line.match(/Contact:\s+(\d+)\/sip:\1@/);
      if (!m) continue;
      const extension = m[1];
      const agent: AsteriskAgentStatus = {
        extension,
        status: /Unavail|NonQual/i.test(line) ? 'offline' : 'online',
        inCall: [...this.calls.values()].some((c) => c.agentExtension === extension && c.status === 'active'),
      };
      this.agents.set(extension, agent);
      this.emit('agent:update', agent);
    }
  }

  private async refreshChannels(): Promise<void> {
    if (!this.loggedIn) return;
    const resp = await this.action({ Action: 'Command', Command: 'core show channels concise' });
    const output = resp.Output || '';
    const seen = new Set<string>();

    for (const line of output.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const p = line.split('!');
      const channel = p[0] || '';
      const uniqueId = p[11] || channel;
      seen.add(uniqueId);

      const existing = this.calls.get(uniqueId);
      const conciseCaller = bestCallerNumber(p[7], p[8], p[10]);
      const callerNumber =
        isRealPhone(existing?.callerNumber)
          ? existing!.callerNumber
          : bestCallerNumber(conciseCaller, existing?.callerNumber);
      const destinationNumber = p[2] || existing?.destinationNumber || 'unknown';
      const durationSec = Number(p[12] || 0) || existing?.durationSec || 0;
      const agentMatch = channel.match(/PJSIP\/(\d+)/);

      const call: AsteriskLiveCall = {
        uniqueId,
        channel,
        callerNumber,
        destinationNumber,
        direction: existing?.direction || 'inbound',
        status: callStatusFromState(p[4]),
        agentExtension: agentMatch?.[1] || existing?.agentExtension,
        queue: existing?.queue,
        line: channel.includes('20001') ? 'TG400-20001' : existing?.line,
        startedAt: existing?.startedAt || new Date(Date.now() - durationSec * 1000).toISOString(),
        durationSec,
      };

      this.calls.set(uniqueId, call);
      this.emit(existing ? 'call:update' : 'call:new', call);
    }

    for (const [id, call] of this.calls) {
      if (!seen.has(id)) {
        this.calls.delete(id);
        this.emit('call:end', { ...call, status: 'ended' });
      }
    }
  }

  private async action(fields: Record<string, string>): Promise<AmiEvent> {
    if (fields.Action !== 'Login') {
      await this.openSocket();
    }

    const actionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = { ...fields, ActionID: actionId };

    const msg =
      Object.entries(payload)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') + '\r\n\r\n';

    return new Promise<AmiEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`AMI action timeout: ${fields.Action}`));
      }, 8000);

      this.pending.set(actionId, (ev) => {
        clearTimeout(timer);
        resolve(ev);
      });

      this.socket!.write(msg);
    });
  }
}
