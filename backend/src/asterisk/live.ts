import { EventEmitter } from 'node:events';
import net from 'node:net';
import { env } from '../config/env.js';
import type {
  AsteriskAgentStatus,
  AsteriskConnectionStatus,
  AsteriskGateway,
  AsteriskLiveCall,
  OriginateParams,
  AsteriskParkedCall,
} from './types.js';

type AmiEvent = Record<string, string>;

function parseAmiBlock(block: string): AmiEvent {
  const out: AmiEvent = {};
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) {
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      out[key] = out[key] ? `${out[key]}\n${value}` : value;
    }
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


function isTrunkExtension(ext?: string): boolean {
  return !!ext && /^(20001|2000\d|tg400)$/i.test(ext);
}

function isRealPhone(v?: string): boolean {
  return !!(v || '').match(/07\d{9,10}|\+?964\d{10}/);
}

function bestExternalNumber(...values: Array<string | undefined>): string | undefined {
  for (const raw of values) {
    const v = (raw || '').trim();
    if (!v || v === '<unknown>' || v === 'unknown') continue;
    const phone = v.match(/07\d{9,10}|\+?964\d{10}|00\d{6,15}|\d{6,15}/)?.[0];
    if (phone && !/^\d{2,4}$/.test(phone)) return phone;
  }
  return undefined;
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
  private parkedCalls = new Map<string, AsteriskParkedCall>();
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

    const calls = [...this.calls.values()].map((c) => ({
      ...c,
      agentExtension: isTrunkExtension(c.agentExtension) ? undefined : c.agentExtension,
    }));

    const outboundNumbers = new Set(
      calls
        .filter((c) => c.direction === 'outbound')
        .map((c) => c.destinationNumber)
        .filter(Boolean)
    );

    return calls.filter((c) => {
      const isTrunkLeg =
        c.line === 'TG400-20001' &&
        !c.agentExtension &&
        c.direction === 'inbound' &&
        c.destinationNumber === '7000' &&
        outboundNumbers.has(c.callerNumber);

      return !isTrunkLeg;
    });
  }

  async getAgentStatuses(): Promise<AsteriskAgentStatus[]> {
    await this.refreshContacts();
    return [...this.agents.values()];
  }

  async getParkedCalls(): Promise<AsteriskParkedCall[]> {
    await this.refreshParkedCalls();
    return [...this.parkedCalls.values()];
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

  private async findCallChannel(uniqueId: string): Promise<string> {
    await this.refreshChannels();

    const call =
      this.calls.get(uniqueId) ||
      [...this.calls.values()].find((c) => c.channel === uniqueId || c.uniqueId === uniqueId);

    const fallbackCall = call || [...this.calls.values()][0];

    if (!fallbackCall?.channel) {
      throw new Error(`Channel not found: ${uniqueId}`);
    }

    return fallbackCall.channel;
  }

  async hold(uniqueId: string): Promise<void> {
    const channel = await this.findCallChannel(uniqueId);

    console.log('[AMI PARK] parking channel', channel);

    const resp = await this.action({
      Action: 'Park',
      Channel: channel,
      TimeoutChannel: channel,
      AnnounceChannel: channel,
      Timeout: '0',
      Parkinglot: 'default',
    });

    console.log('[AMI PARK] response', resp);

    if (!/success/i.test(resp.Response || '')) {
      throw new Error(resp.Message || 'Park failed');
    }
  }

  async unhold(_uniqueId: string): Promise<void> {
    throw new Error('Use retrieveParkedCall for parked calls');
  }

  async retrieveParkedCall(parkingSpace: string, targetExtension: string): Promise<void> {
    const resp = await this.action({
      Action: 'Originate',
      Channel: `PJSIP/${targetExtension}`,
      Exten: parkingSpace,
      Context: 'parkedcalls',
      Priority: '1',
      CallerID: targetExtension,
      Async: 'true',
    });

    if (!/success/i.test(resp.Response || '')) {
      throw new Error(resp.Message || `Retrieve parked call failed: ${parkingSpace}`);
    }

    this.parkedCalls.delete(parkingSpace);
    await this.refreshChannels();
  }

  async transfer(uniqueId: string, target: string, attended = false): Promise<void> {
    await this.refreshChannels();

    const call =
      this.calls.get(uniqueId) ||
      [...this.calls.values()].find((c) => c.channel === uniqueId || c.uniqueId === uniqueId);

    const fallbackCall = call || [...this.calls.values()][0];

    if (!fallbackCall?.channel) {
      throw new Error(`Channel not found for transfer: ${uniqueId}`);
    }

    if (attended) {
      const resp = await this.action({
        Action: 'Atxfer',
        Channel: fallbackCall.channel,
        Exten: target,
        Context: 'internal',
      });

      if (!/success/i.test(resp.Response || '')) {
        throw new Error(resp.Message || `Attended transfer failed to ${target}`);
      }

      await this.refreshChannels();
      return;
    }

    if (fallbackCall.channel.startsWith('Local/')) {
      const resp = await this.action({
        Action: 'Originate',
        Channel: `PJSIP/${target}`,
        Application: 'Playback',
        Data: 'demo-congrats',
        CallerID: fallbackCall.callerNumber || 'test-live',
        Async: 'true',
      });

      if (!/success/i.test(resp.Response || '')) {
        throw new Error(resp.Message || `Test transfer originate failed to ${target}`);
      }

      await this.refreshChannels();
      return;
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
      case 'ParkedCall':
      case 'ParkedCallParked':
        this.upsertParkedCall(ev);
        break;
      case 'ParkedCallGiveUp':
      case 'ParkedCallTimeOut':
      case 'ParkedCallUnparked':
        this.removeParkedCall(ev);
        break;
    }
  }

  private upsertCall(ev: AmiEvent) {
    if (['Newchannel', 'Newstate', 'DialBegin', 'DialEnd'].includes(ev.Event || '')) {
      console.log('[AMI CALLER]', {
        Event: ev.Event,
        Channel: ev.Channel,
        DestChannel: ev.DestChannel,
        Exten: ev.Exten,
        DestExten: ev.DestExten,
        Application: ev.Application,
        ApplicationData: ev.ApplicationData,
        CallerIDName: ev.CallerIDName,
        CallerIDNum: ev.CallerIDNum,
        ConnectedLineName: ev.ConnectedLineName,
        ConnectedLineNum: ev.ConnectedLineNum,
        DialString: ev.DialString,
        Uniqueid: ev.Uniqueid,
        Linkedid: ev.Linkedid,
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

    const agentMatch = `${channel} ${ev.DestChannel || ''}`.match(/PJSIP\/(\d+)/);
    const matchedExtension = agentMatch?.[1];
    const agentExtension = !isTrunkExtension(matchedExtension)
      ? (matchedExtension || existing?.agentExtension)
      : existing?.agentExtension;

    const externalNumber = bestExternalNumber(
      ev.Exten,
      ev.DestExten,
      ev.ConnectedLineNum,
      ev.ConnectedLineName,
      ev.ApplicationData,
      existing?.destinationNumber
    );

    const isOutbound =
      !!agentExtension &&
      !!externalNumber &&
      externalNumber !== agentExtension &&
      !['7000', 's', 'unknown'].includes(String(externalNumber));

    const destinationNumber =
      isOutbound
        ? externalNumber
        : ev.Exten ||
          ev.DestExten ||
          ev.ConnectedLineNum ||
          existing?.destinationNumber ||
          'unknown';

    const call: AsteriskLiveCall = {
      uniqueId,
      channel,
      callerNumber: isOutbound ? agentExtension : callerNumber,
      destinationNumber,
      direction: isOutbound ? 'outbound' : (existing?.direction || 'inbound'),
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


  private upsertParkedCall(ev: AmiEvent) {
    const space =
      ev.ParkingSpace ||
      ev.ParkedExten ||
      ev.ParkedExtension ||
      ev.Extension ||
      ev.Exten;

    if (!space) return;

    this.parkedCalls.set(space, {
      parkingSpace: space,
      parkingLot: ev.Parkinglot || ev.ParkingLot,
      channel: ev.ParkedChannel || ev.Channel,
      parkerDialString: ev.ParkerDialString || ev.Parker || ev.TimeoutChannel,
      callerNumber: ev.CallerIDNum || ev.CallerIDName || ev.ConnectedLineNum,
      parkedAt: new Date().toISOString(),
    });
  }

  private removeParkedCall(ev: AmiEvent) {
    const space =
      ev.ParkingSpace ||
      ev.ParkedExten ||
      ev.ParkedExtension ||
      ev.Extension ||
      ev.Exten;

    if (space) this.parkedCalls.delete(space);
  }

  private async refreshParkedCalls(): Promise<void> {
    if (!this.loggedIn) return;

    const resp = await this.action({
      Action: 'ParkedCalls',
      ParkingLot: 'default',
    });

    const next = new Map<string, AsteriskParkedCall>();
    const raw = resp as Record<string, string>;

    const chunks = Object.values(raw).join('\n');

    for (const line of chunks.split('\n')) {
      const spaceMatch = line.match(/\b(70[1-9]|71[0-9]|720)\b/);
      if (!spaceMatch) continue;

      const space = spaceMatch[1];
      next.set(space, {
        parkingSpace: space,
        parkingLot: 'default',
        channel: line.trim(),
        parkedAt: this.parkedCalls.get(space)?.parkedAt || new Date().toISOString(),
      });
    }

    this.parkedCalls = next;
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
        status: /Unavail/i.test(line) ? 'offline' : 'online',
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
      const durationSec = Number(p[12] || 0) || existing?.durationSec || 0;
      const agentMatch = channel.match(/PJSIP\/(\d+)/);
      const matchedExtension = agentMatch?.[1];
    const agentExtension = !isTrunkExtension(matchedExtension)
      ? (matchedExtension || existing?.agentExtension)
      : existing?.agentExtension;
      const externalNumber = bestExternalNumber(existing?.destinationNumber, p[2], p[7], p[8], p[10]);
      const isOutbound =
        !!agentExtension &&
        !isTrunkExtension(agentExtension) &&
        !!externalNumber &&
        externalNumber !== agentExtension &&
        !['7000', 's', 'unknown'].includes(String(externalNumber));

      const keepExistingOutbound =
        existing?.direction === 'outbound' &&
        !!existing.destinationNumber &&
        existing.destinationNumber !== 'unknown';

      const destinationNumber = keepExistingOutbound
        ? existing.destinationNumber
        : isOutbound
          ? externalNumber
          : (p[2] || existing?.destinationNumber || 'unknown');

      const call: AsteriskLiveCall = {
        uniqueId,
        channel,
        callerNumber: keepExistingOutbound ? existing.callerNumber : (isOutbound ? agentExtension : callerNumber),
        destinationNumber,
        direction: keepExistingOutbound ? 'outbound' : (isOutbound ? 'outbound' : (existing?.direction || 'inbound')),
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
