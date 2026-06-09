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
