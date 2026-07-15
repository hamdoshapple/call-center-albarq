import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { getAsteriskGateway } from '../asterisk/index.js';

const SETTINGS_KEY = 'asterisk';

const DEFAULTS = {
  serverIp: '127.0.0.1', sipPort: 5060, rtpStart: 10000, rtpEnd: 20000,
  amiHost: '127.0.0.1', amiPort: 5038, amiUser: 'admin',
  ariHost: '127.0.0.1', ariPort: 8088, ariUser: 'asterisk',
  trunkName: 'tg400-trunk', trunkHost: '192.168.1.50',
  extensionStart: 1001, extensionEnd: 1099, recordingPath: '/var/spool/asterisk/monitor',
  codecs: ['alaw', 'ulaw', 'g729', 'opus'],
};

export async function getSettings(_req: Request, res: Response) {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  res.json(row?.value ?? DEFAULTS);
}

export async function updateSettings(req: Request, res: Response) {
  const current = (await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } }))?.value ?? DEFAULTS;
  const merged = { ...(current as object), ...req.body };
  const row = await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: merged },
    create: { key: SETTINGS_KEY, value: merged },
  });
  res.json(row.value);
}

export async function connectionStatus(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  res.json(await gw.getConnectionStatus());
}

export async function reload(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  res.json(await gw.reloadConfig());
}

const controlSchema = z.object({
  uniqueId: z.string().min(1),
  target: z.string().optional(),
  attended: z.boolean().optional(),
  targetType: z.string().optional(),
  targetLabel: z.string().optional(),
  transferType: z.string().optional(),
  callerNumber: z.string().optional(),
  parkingSpace: z.string().optional(),
  targetExtension: z.string().optional(),
});

export async function control(req: Request, res: Response) {
  const gw = getAsteriskGateway();
  const action = req.params.action;
  const body = controlSchema.partial().parse(req.body);

  switch (action) {
    case 'answer': await gw.answer(body.uniqueId!); break;
    case 'hangup': await gw.hangup(body.uniqueId!); break;
    case 'hold': await gw.hold(body.uniqueId!); break;
    case 'unhold': {
      if (body.parkingSpace) {
        const targetExtension = body.targetExtension || req.user?.extension;
        if (!targetExtension) {
          return res.status(400).json({
            code: 'TARGET_EXTENSION_REQUIRED',
            message: 'Target extension is required to retrieve parked call'
          });
        }
        await gw.retrieveParkedCall(body.parkingSpace, targetExtension);
        break;
      }

      await gw.unhold(body.uniqueId!);
      break;
    }
    case 'transfer': {
      const fromAgent = req.user?.agentId
        ? await prisma.agent.findUnique({
            where: { id: req.user.agentId },
            include: { extension: true },
          })
        : null;

      const targetAgent = body.target
        ? await prisma.agent.findFirst({
            where: {
              OR: [
                { id: body.target },
                { extension: { number: body.target } },
              ],
            },
            include: { extension: true },
          })
        : null;

      const targetQueue = body.target
        ? await prisma.queue.findFirst({
            where: {
              OR: [
                { id: body.target },
                { number: body.target },
              ],
            },
          })
        : null;

      if ((body.targetType || 'agent') === 'agent' && body.target) {
        const statuses = await gw.getAgentStatuses();
        const targetStatus = statuses.find((a) => a.extension === body.target);

        if (!targetStatus) {
          return res.status(409).json({
            error: `Target extension ${body.target} has no active contact`
          });
        }
      }

      if ((body.targetType || 'agent') === 'agent' && body.target) {
        const statuses = await gw.getAgentStatuses();
        const targetStatus = statuses.find((a) => a.extension === body.target);

        if (!targetStatus) {
          return res.status(409).json({
            code: 'TARGET_OFFLINE',
            message: `Extension ${body.target} is not available now`
          });
        }

        if (targetStatus.inCall || targetStatus.status === 'busy') {
          return res.status(409).json({
            code: 'TARGET_BUSY',
            message: `Extension ${body.target} is busy now`
          });
        }

        if (targetStatus.status === 'offline') {
          return res.status(409).json({
            code: 'TARGET_OFFLINE',
            message: `Extension ${body.target} is offline now`
          });
        }
      }

      await gw.transfer(body.uniqueId!, body.target!, body.attended);

      let call = await prisma.call.findFirst({
        where: {
          OR: [
            { uniqueId: body.uniqueId },
            { id: body.uniqueId },
          ],
        },
      });

      if (!call) {
        call = await prisma.call.create({
          data: {
            uniqueId: body.uniqueId,
            callerNumber: body.callerNumber || 'live-call',
            destinationNumber: body.target || 'transfer',
            direction: 'internal',
            status: 'ended',
            disposition: 'answered',
            agentId: req.user?.agentId ?? null,
          },
        });
      }

      await prisma.callEvent.create({
        data: {
          callId: call.id,
          type: 'transfer',
          actor: req.user?.agentId || req.user?.username,
          detail: JSON.stringify({
            callerNumber: call.callerNumber,
            destinationNumber: call.destinationNumber,
            fromAgentId: fromAgent?.id || req.user?.agentId || '',
            fromAgentName: fromAgent?.name || req.user?.username || '',
            fromExtension: fromAgent?.extension?.number || req.user?.extension || '',
            targetType: body.targetType || (targetQueue ? 'queue' : 'agent'),
            targetId: body.target || '',
            targetLabel:
              body.targetLabel ||
              targetAgent?.name ||
              targetQueue?.name ||
              body.target ||
              '',
            targetAgentId: targetAgent?.id || '',
            targetAgentName: targetAgent?.name || '',
            targetExtension: targetAgent?.extension?.number || '',
            targetQueueId: targetQueue?.id || '',
            targetQueueName: targetQueue?.name || '',
            targetQueueNumber: targetQueue?.number || '',
            type: body.transferType || (body.attended ? 'attended' : 'blind'),
            status: 'completed',
          }),
        },
      });

      break;
    }
    default: return res.status(400).json({ error: `Unknown action: ${action}` });
  }
  res.json({ success: true, message: action === 'transfer' ? 'TRANSFER_COMPLETED' : 'OK' });
}


export async function agentStatuses(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  res.json(await gw.getAgentStatuses());
}


export async function parkedCalls(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  res.json(await gw.getParkedCalls());
}


export async function heldCalls(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  res.json(await gw.getHeldCalls());
}


async function ast(command: string) {
  const gw = getAsteriskGateway() as any;
  const resp = await gw.action({
    Action: 'Command',
    Command: command,
  });

  const output = Array.isArray(resp.Output)
    ? resp.Output.join('\n')
    : String(resp.Output || '');

  return {
    command,
    stdout: output,
    stderr: resp.Message || '',
  };
}

export async function cli(req: Request, res: Response) {
  const command = z.string().min(1).max(120).parse(req.body?.command);

  const allowed = [
    'pjsip show contacts',
    'pjsip show endpoints',
    'pjsip show endpoint',
    'pjsip show aors',
    'pjsip show registrations',
    'pjsip show identify',
    'pjsip show transports',
    'rtp show settings',
    'http show status',
    'manager show settings',
    'pjsip show settings',
    'core show channels',
    'core show uptime',
    'queue show',
    'dialplan show',
  ];

  if (!allowed.some((x) => command.startsWith(x))) {
    return res.status(403).json({ error: 'Command not allowed' });
  }

  res.json(await ast(command));
}

export async function contacts(_req: Request, res: Response) {
  res.json(await ast('pjsip show contacts'));
}

export async function endpoints(_req: Request, res: Response) {
  res.json(await ast('pjsip show endpoints'));
}

export async function registrations(_req: Request, res: Response) {
  res.json(await ast('pjsip show registrations'));
}

export async function transports(_req: Request, res: Response) {
  res.json(await ast('pjsip show transports'));
}

export async function pjsipSettings(_req: Request, res: Response) {
  res.json(await ast('pjsip show settings'));
}

export async function channels(_req: Request, res: Response) {
  res.json(await ast('core show channels'));
}

export async function uptime(_req: Request, res: Response) {
  res.json(await ast('core show uptime'));
}

export async function queues(_req: Request, res: Response) {
  res.json(await ast('queue show'));
}

export async function reloadPjsip(_req: Request, res: Response) {
  res.json(await ast('pjsip reload'));
}

export async function reloadDialplan(_req: Request, res: Response) {
  res.json(await ast('dialplan reload'));
}


function parseContactsText(stdout: string) {
  return stdout.split('\n')
    .filter((line) => line.trim().startsWith('Contact:') && !line.includes('<Aor/ContactUri'))
    .map((line) => {
      const m = line.match(/Contact:\s+(\S+)\/sip:([^@\s]+)@([^;\s]+)(?:;transport=([A-Z]+))?.*?\s(Avail|Unavail|NonQual|Unknown)\s+([0-9.\-nan]+)?/i);
      return {
        raw: line.trim(),
        aor: m?.[1] || '',
        user: m?.[2] || '',
        host: m?.[3] || '',
        transport: m?.[4] || '',
        status: m?.[5] || 'Unknown',
        rtt: m?.[6] || '',
      };
    });
}

function parseEndpointsText(stdout: string) {
  return stdout.split('\n')
    .filter((line) => line.trim().startsWith('Endpoint:'))
    .map((line) => {
      const m = line.match(/Endpoint:\s+(\S+)\s+([A-Za-z ]+?)\s+(\d+\s+of\s+\S+)/);
      return {
        raw: line.trim(),
        endpoint: m?.[1] || '',
        state: (m?.[2] || '').trim(),
        channels: m?.[3] || '',
      };
    })
    .filter((x) => x.endpoint && x.endpoint !== '<Endpoint/CID.....................................>');
}

function parseQueuesText(stdout: string) {
  const queues: Array<{ queue: string; calls: number; strategy: string; members: number; callers: number; raw: string }> = [];
  const blocks = stdout.split(/\n(?=\S+ has \d+ calls)/);

  for (const block of blocks) {
    const first = block.split('\n')[0] || '';
    const m = first.match(/^(\S+) has (\d+) calls .* in '([^']+)' strategy/);
    if (!m) continue;

    const membersSection = block.split('Members:')[1]?.split('Callers:')[0] || '';
    const callersSection = block.split('Callers:')[1] || '';
    const members = membersSection.split('\n').filter((x) => x.includes('PJSIP/')).length;
    const callers = callersSection.split('\n').filter((x) => x.trim() && !x.includes('No Callers')).length;

    queues.push({
      queue: m[1],
      calls: Number(m[2]),
      strategy: m[3],
      members,
      callers,
      raw: block.trim(),
    });
  }

  return queues;
}

function parseChannelsText(stdout: string) {
  const summary = stdout.match(/(\d+) active channels?\n(\d+) active calls?\n(\d+) calls processed/);
  return {
    activeChannels: Number(summary?.[1] || 0),
    activeCalls: Number(summary?.[2] || 0),
    callsProcessed: Number(summary?.[3] || 0),
    raw: stdout,
  };
}

export async function contactsJson(_req: Request, res: Response) {
  const result = await ast('pjsip show contacts');
  res.json(parseContactsText(result.stdout));
}

export async function endpointsJson(_req: Request, res: Response) {
  const result = await ast('pjsip show endpoints');
  res.json(parseEndpointsText(result.stdout));
}

export async function queuesJson(_req: Request, res: Response) {
  const result = await ast('queue show');
  res.json(parseQueuesText(result.stdout));
}

export async function channelsJson(_req: Request, res: Response) {
  const result = await ast('core show channels');
  res.json(parseChannelsText(result.stdout));
}


const RAW_FILES: Record<string, { path: string; reload: string }> = {
  pjsip: { path: '/etc/asterisk/pjsip.conf', reload: 'pjsip reload' },
  extensions: { path: '/etc/asterisk/extensions.conf', reload: 'dialplan reload' },
  http: { path: '/etc/asterisk/http.conf', reload: 'core reload' },
  manager: { path: '/etc/asterisk/manager.conf', reload: 'manager reload' },
  rtp: { path: '/etc/asterisk/rtp.conf', reload: 'core reload' },
  queues: { path: '/etc/asterisk/queues.conf', reload: 'queue reload all' },
};

function rawFileKey(req: Request) {
  const key = String(req.params.file || '');
  const item = RAW_FILES[key];
  if (!item) throw new Error('Invalid raw file');
  return { key, ...item };
}

export async function readRawFile(req: Request, res: Response) {
  const { key, path } = rawFileKey(req);
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(path, 'utf8');
  res.json({ key, path, content });
}

export async function writeRawFile(req: Request, res: Response) {
  const { key, path, reload } = rawFileKey(req);
  const content = z.string().min(1).max(300000).parse(req.body?.content);
  const fs = await import('node:fs/promises');

  const old = await fs.readFile(path, 'utf8');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${path}.bak.raw.${stamp}`;
  await fs.writeFile(backup, old, 'utf8');
  await fs.writeFile(path, content, 'utf8');

  const result = await ast(reload);
  res.json({ ok: true, key, path, backup, reload, result });
}


type ConfSection = { name: string; body: string; type: string };

function parseConfSections(content: string): ConfSection[] {
  const sections: ConfSection[] = [];
  const lines = content.split(/\r?\n/);
  let currentName = '';
  let currentLines: string[] = [];

  function pushCurrent() {
    if (!currentName) return;
    const body = `[${currentName}]\n${currentLines.join('\n')}`.trimEnd() + '\n';
    const type = body.match(/^\s*type\s*=\s*(.+?)\s*$/m)?.[1]?.trim() || '';
    sections.push({ name: currentName, body, type });
  }

  for (const line of lines) {
    const m = line.match(/^\[([^\]]+)\]\s*$/);
    if (m) {
      pushCurrent();
      currentName = m[1].trim();
      currentLines = [];
    } else if (currentName) {
      currentLines.push(line);
    }
  }

  pushCurrent();
  return sections;
}

function sectionValue(section: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return section.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1]?.trim() || '';
}

function setSectionValue(section: string, key: string, value: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  if (section.match(new RegExp(`^\\s*${escaped}\\s*=`, 'm'))) {
    return section.replace(new RegExp(`^\\s*${escaped}\\s*=.*$`, 'm'), line);
  }
  return section.trimEnd() + `\n${line}\n`;
}

function replaceNamedTypedSection(content: string, name: string, type: string, next: string) {
  const sections = parseConfSections(content);
  let replaced = false;
  let output = content;

  for (const sec of sections) {
    if (sec.name === name && sec.type === type) {
      output = output.replace(sec.body, next.trimEnd() + '\n');
      replaced = true;
      break;
    }
  }

  if (!replaced) throw new Error(`Section [${name}] type=${type} not found`);
  return output;
}

function discoverTgGateway(pjsip: string) {
  const sections = parseConfSections(pjsip);

  let endpoint = sections.find((x) =>
    x.type === 'endpoint' &&
    (
      sectionValue(x.body, 'context') === 'from-tg400' ||
      sectionValue(x.body, 'identify_by') === 'ip' ||
      sectionValue(x.body, 'from_user') !== ''
    )
  );

  if (!endpoint) endpoint = sections.find((x) => x.type === 'endpoint' && sectionValue(x.body, 'identify_by') === 'ip');
  if (!endpoint) throw new Error('No TG gateway endpoint discovered');

  const endpointName = endpoint.name;
  const aorName = sectionValue(endpoint.body, 'aors') || endpointName;
  const authName = sectionValue(endpoint.body, 'auth') || endpointName;

  const auth = sections.find((x) => x.name === authName && x.type === 'auth') || sections.find((x) => x.name === endpointName && x.type === 'auth');
  const aor = sections.find((x) => x.name === aorName && x.type === 'aor') || sections.find((x) => x.name === endpointName && x.type === 'aor');
  const identify = sections.find((x) => x.type === 'identify' && sectionValue(x.body, 'endpoint') === endpointName);

  if (!auth) throw new Error(`Auth section for endpoint ${endpointName} not found`);
  if (!aor) throw new Error(`AOR section for endpoint ${endpointName} not found`);
  if (!identify) throw new Error(`Identify section for endpoint ${endpointName} not found`);

  return { endpoint, auth, aor, identify, endpointName, authName, aorName };
}

export async function getDiscoveredSimpleRawSettings(_req: Request, res: Response) {
  const fs = await import('node:fs/promises');

  const pjsip = await fs.readFile('/etc/asterisk/pjsip.conf', 'utf8');
  const http = await fs.readFile('/etc/asterisk/http.conf', 'utf8');
  const rtp = await fs.readFile('/etc/asterisk/rtp.conf', 'utf8');

  const d = discoverTgGateway(pjsip);
  const global = pjsip.match(/^\[global\]\n(?:[^\[]|\n(?!\[))*/m)?.[0] || '';

  res.json({
    discovered: {
      endpointSection: d.endpoint.name,
      authSection: d.auth.name,
      aorSection: d.aor.name,
      identifySection: d.identify.name,
    },
    tg400: {
      endpoint: d.endpoint.name,
      context: sectionValue(d.endpoint.body, 'context'),
      codecs: sectionValue(d.endpoint.body, 'allow'),
      fromUser: sectionValue(d.endpoint.body, 'from_user'),
      fromDomain: sectionValue(d.endpoint.body, 'from_domain'),
      callerId: sectionValue(d.endpoint.body, 'callerid'),
      identifyBy: sectionValue(d.endpoint.body, 'identify_by'),
      match: sectionValue(d.identify.body, 'match'),
      maxContacts: sectionValue(d.aor.body, 'max_contacts'),
      qualifyFrequency: sectionValue(d.aor.body, 'qualify_frequency'),
      username: sectionValue(d.auth.body, 'username'),
      password: sectionValue(d.auth.body, 'password'),
      rewriteContact: sectionValue(d.endpoint.body, 'rewrite_contact'),
      forceRport: sectionValue(d.endpoint.body, 'force_rport'),
      rtpSymmetric: sectionValue(d.endpoint.body, 'rtp_symmetric'),
      directMedia: sectionValue(d.endpoint.body, 'direct_media'),
    },
    global: {
      endpointIdentifierOrder: sectionValue(global, 'endpoint_identifier_order'),
    },
    http: {
      enabled: sectionValue(http, 'enabled') || 'no',
      bindaddr: sectionValue(http, 'bindaddr'),
      bindport: sectionValue(http, 'bindport') || '8088',
    },
    rtp: {
      rtpstart: sectionValue(rtp, 'rtpstart'),
      rtpend: sectionValue(rtp, 'rtpend'),
    },
  });
}

export async function updateDiscoveredSimpleRawSettings(req: Request, res: Response) {
  const fs = await import('node:fs/promises');
  const body = z.object({
    tg400: z.object({
      context: z.string().min(1),
      codecs: z.string().min(1),
      fromUser: z.string().min(1),
      fromDomain: z.string().optional().default(''),
      callerId: z.string().optional().default(''),
      identifyBy: z.string().min(1),
      match: z.string().min(1),
      maxContacts: z.string().min(1),
      qualifyFrequency: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
      rewriteContact: z.string().min(1),
      forceRport: z.string().min(1),
      rtpSymmetric: z.string().min(1),
      directMedia: z.string().min(1),
    }),
    global: z.object({ endpointIdentifierOrder: z.string().min(1) }),
    http: z.object({
      enabled: z.string().min(1),
      bindaddr: z.string().min(1),
      bindport: z.string().min(1),
    }),
    rtp: z.object({
      rtpstart: z.string().min(1),
      rtpend: z.string().min(1),
    }),
  }).parse(req.body);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  let pjsip = await fs.readFile('/etc/asterisk/pjsip.conf', 'utf8');
  let http = await fs.readFile('/etc/asterisk/http.conf', 'utf8');
  let rtp = await fs.readFile('/etc/asterisk/rtp.conf', 'utf8');

  const d = discoverTgGateway(pjsip);

  await fs.writeFile(`/etc/asterisk/pjsip.conf.bak.simple.${stamp}`, pjsip);
  await fs.writeFile(`/etc/asterisk/http.conf.bak.simple.${stamp}`, http);
  await fs.writeFile(`/etc/asterisk/rtp.conf.bak.simple.${stamp}`, rtp);

  let endpoint = d.endpoint.body;
  endpoint = setSectionValue(endpoint, 'context', body.tg400.context);
  endpoint = setSectionValue(endpoint, 'allow', body.tg400.codecs);
  endpoint = setSectionValue(endpoint, 'from_user', body.tg400.fromUser);
  endpoint = setSectionValue(endpoint, 'from_domain', body.tg400.fromDomain);
  endpoint = setSectionValue(endpoint, 'callerid', body.tg400.callerId || `${body.tg400.fromUser} <${body.tg400.fromUser}>`);
  endpoint = setSectionValue(endpoint, 'identify_by', body.tg400.identifyBy);
  endpoint = setSectionValue(endpoint, 'rewrite_contact', body.tg400.rewriteContact);
  endpoint = setSectionValue(endpoint, 'force_rport', body.tg400.forceRport);
  endpoint = setSectionValue(endpoint, 'rtp_symmetric', body.tg400.rtpSymmetric);
  endpoint = setSectionValue(endpoint, 'direct_media', body.tg400.directMedia);
  pjsip = replaceNamedTypedSection(pjsip, d.endpoint.name, 'endpoint', endpoint);

  let auth = d.auth.body;
  auth = setSectionValue(auth, 'username', body.tg400.username);
  auth = setSectionValue(auth, 'password', body.tg400.password);
  pjsip = replaceNamedTypedSection(pjsip, d.auth.name, 'auth', auth);

  let aor = d.aor.body;
  aor = setSectionValue(aor, 'max_contacts', body.tg400.maxContacts);
  aor = setSectionValue(aor, 'qualify_frequency', body.tg400.qualifyFrequency);
  pjsip = replaceNamedTypedSection(pjsip, d.aor.name, 'aor', aor);

  let identify = d.identify.body;
  identify = setSectionValue(identify, 'match', body.tg400.match);
  pjsip = replaceNamedTypedSection(pjsip, d.identify.name, 'identify', identify);

  pjsip = pjsip.replace(/^endpoint_identifier_order\s*=.*$/m, `endpoint_identifier_order=${body.global.endpointIdentifierOrder}`);

  http = http.replace(/^enabled\s*=.*$/m, `enabled=${body.http.enabled}`);
  http = http.replace(/^bindaddr\s*=.*$/m, `bindaddr=${body.http.bindaddr}`);
  http = http.replace(/^bindport\s*=.*$/m, `bindport=${body.http.bindport}`);

  rtp = rtp.replace(/^rtpstart\s*=.*$/m, `rtpstart=${body.rtp.rtpstart}`);
  rtp = rtp.replace(/^rtpend\s*=.*$/m, `rtpend=${body.rtp.rtpend}`);

  await fs.writeFile('/etc/asterisk/pjsip.conf', pjsip);
  await fs.writeFile('/etc/asterisk/http.conf', http);
  await fs.writeFile('/etc/asterisk/rtp.conf', rtp);

  const reloads = [await ast('pjsip reload'), await ast('core reload')];

  res.json({ ok: true, backups: stamp, discovered: d, reloads });
}
