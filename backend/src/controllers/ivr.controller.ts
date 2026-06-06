import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const optionSchema = z.object({
  key: z.coerce.string().min(1),
  label: z.string().nullish().transform((v) => v ?? ''),
  destinationType: z.enum(['queue', 'department', 'agent', 'ivr', 'hangup', 'voicemail', 'external']),
  destinationId: z.string().nullish().transform((v) => v ?? undefined),
  destinationValue: z.string().nullish().transform((v) => v ?? undefined),
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  greetingPromptId: z.string().nullish(),
  timeout: z.number().optional(),
  timeoutDestination: z.string().optional(),
  invalidDestination: z.string().optional(),
  repeatOnInvalid: z.boolean().optional(),
  maxRepeats: z.number().optional(),
  active: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
});

export async function list(_req: Request, res: Response) {
  const rows = await prisma.ivrMenu.findMany({ include: { options: true }, orderBy: { createdAt: 'asc' } });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.ivrMenu.create({
    data: {
      name: data.name, description: data.description, greetingPromptId: data.greetingPromptId ?? null,
      timeout: data.timeout ?? 10, timeoutDestination: data.timeoutDestination ?? 'hangup',
      invalidDestination: data.invalidDestination ?? 'repeat', repeatOnInvalid: data.repeatOnInvalid ?? true,
      maxRepeats: data.maxRepeats ?? 3, active: data.active ?? true,
      options: data.options ? { create: data.options } : undefined,
    },
    include: { options: true },
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.ivrMenu.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('IVR menu not found');

  await prisma.ivrMenu.update({
    where: { id: req.params.id },
    data: {
      name: data.name, description: data.description,
      greetingPromptId: data.greetingPromptId === undefined ? undefined : data.greetingPromptId,
      timeout: data.timeout, timeoutDestination: data.timeoutDestination,
      invalidDestination: data.invalidDestination, repeatOnInvalid: data.repeatOnInvalid,
      maxRepeats: data.maxRepeats, active: data.active,
    },
  });

  if (data.options) {
    await prisma.ivrOption.deleteMany({ where: { menuId: req.params.id } });
    await prisma.ivrOption.createMany({ data: data.options.map((o) => ({ ...o, menuId: req.params.id })) });
  }

  const row = await prisma.ivrMenu.findUnique({ where: { id: req.params.id }, include: { options: true } });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.ivrMenu.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('IVR menu not found');
  await prisma.ivrMenu.delete({ where: { id: req.params.id } });
  res.status(204).end();
}



function safeDialplanValue(v?: string | null) {
  return String(v || '').replace(/[^0-9A-Za-z_+*@#.-]/g, '');
}

async function getAgentExtension(agentIdOrNumber?: string | null) {
  const value = safeDialplanValue(agentIdOrNumber);
  if (!value) return '';

  const agent = await prisma.agent.findFirst({
    where: {
      OR: [
        { id: value },
        { extension: { number: value } },
        { extension: { sipUsername: value } },
      ],
    },
    include: { extension: true },
  });

  return agent?.extension?.sipUsername || agent?.extension?.number || value;
}

async function getDepartmentDialTargets(value?: string | null) {
  const v = safeDialplanValue(value);

  const department = await prisma.department.findFirst({
    where: {
      OR: [
        { id: v },
        { name: v },
        { nameEn: v },
      ],
    },
    include: {
      agents: { include: { extension: true } },
    },
  });

  const targets = (department?.agents || [])
    .map((a) => a.extension?.sipUsername || a.extension?.number)
    .filter(Boolean)
    .map((n) => `PJSIP/${n}`);

  return targets.length ? targets.join('&') : 'PJSIP/101&PJSIP/33';
}

async function optionDialplan(option: any) {
  const value = safeDialplanValue(option.destinationValue || option.destinationId);
  const label = String(option.label || option.key || '').replace(/"/g, '');

  switch (option.destinationType) {
    case 'agent': {
      const ext = await getAgentExtension(value);
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> agent ${ext || value})`,
        ` same => n,Set(CALLERID(num)=\${REAL_CALLER})`,
        ` same => n,Set(CALLERID(name)=\${REAL_CALLER})`,
        ` same => n,Dial(PJSIP/${ext || value || '101'},30,b(set-real-cid^s^1(\${REAL_CALLER})))`,
        ' same => n,Playback(vm-nobodyavail)',
        ' same => n,Hangup()',
      ].join('\n');
    }

    case 'external':
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> external ${value})`,
        ` same => n,Dial(PJSIP/${value}@20001,60)`,
        ' same => n,Hangup()',
      ].join('\n');

    case 'ivr':
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> nested IVR ${value})`,
        ` same => n,Goto(cc-ivr-${value || 'main'},s,1)`,
      ].join('\n');

    case 'hangup':
      return [
        ' same => n,Playback(vm-goodbye)',
        ' same => n,Hangup()',
      ].join('\n');

    case 'voicemail':
      return [
        ' same => n,Playback(vm-nobodyavail)',
        ' same => n,Hangup()',
      ].join('\n');

    case 'queue': {
      const queue = await prisma.queue.findFirst({
        where: { OR: [{ id: value }, { number: value }, { name: value }] },
      });
      const qnum = safeDialplanValue(queue?.number || value);
      const wait = Number(queue?.maxWaitTime || 60);

      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> REAL Queue ${qnum})`,
        ` same => n,Set(CALLERID(num)=\${REAL_CALLER})`,
        ` same => n,Set(CALLERID(name)=\${REAL_CALLER})`,
        ` same => n,Queue(${qnum},t,,,${wait})`,
        ' same => n,Playback(vm-nobodyavail)',
        ' same => n,Hangup()',
      ].join('\n');
    }

    case 'department': {
      const dialTarget = await getDepartmentDialTargets(value);
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> DB department ${value})`,
        ` same => n,Set(CALLERID(num)=\${REAL_CALLER})`,
        ` same => n,Set(CALLERID(name)=\${REAL_CALLER})`,
        ` same => n,Dial(${dialTarget},30,b(set-real-cid^s^1(\${REAL_CALLER})))`,
        ' same => n,Playback(vm-nobodyavail)',
        ' same => n,Hangup()',
      ].join('\n');
    }

    default:
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> default)`,
        ' same => n,Playback(vm-nobodyavail)',
        ' same => n,Hangup()',
      ].join('\n');
  }
}

async function buildIvrDialplan(menu: any) {
  const timeout = Number(menu.timeout || 10);
  const promptSound = 'ivr_main';

  const lines: string[] = [];

  lines.push('; >>> ALBARQ_IVR_AUTO_START');
  lines.push('[cc-ivr-main]');
  lines.push('exten => s,1,NoOp(Albarq IVR Main - Caller ${CALLERID(num)})');
  lines.push(' same => n,Answer()');
  lines.push(' same => n,Set(__FROM_HDR=${PJSIP_HEADER(read,From)})');
  lines.push(' same => n,Set(__FROM_NAME=${CUT(FROM_HDR,<,1)})');
  lines.push(' same => n,Set(__FROM_NAME=${FILTER(0-9+,${FROM_NAME})})');
  lines.push(' same => n,Set(__REAL_CALLER=${IF($["${FROM_NAME}"!=""]?${FROM_NAME}:${CALLERID(num)})})');
  lines.push(' same => n,Set(CALLERID(num)=${REAL_CALLER})');
  lines.push(' same => n,Set(CALLERID(name)=${REAL_CALLER})');
  lines.push(' same => n(start),NoOp(Playing IVR prompt)');
  lines.push(' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/' + promptSound + '.wav)}"="1"]?Background(/var/lib/asterisk/moh/' + promptSound + '))');
  lines.push(` same => n,WaitExten(${timeout})`);

  for (const option of menu.options || []) {
    const key = safeDialplanValue(option.key);
    if (!key) continue;
    lines.push(`exten => ${key},1,NoOp(IVR option ${key})`);
    lines.push(await optionDialplan(option));
  }

  lines.push('exten => t,1,NoOp(IVR timeout)');
  lines.push(' same => n,Goto(cc-ivr-main,s,start)');

  lines.push('exten => i,1,NoOp(IVR invalid option)');
  lines.push(' same => n,Goto(cc-ivr-main,s,start)');

  lines.push('; <<< ALBARQ_IVR_AUTO_END');

  return lines.join('\n') + '\n';
}

function replaceAutoBlock(content: string, block: string) {
  const re = /; >>> ALBARQ_IVR_AUTO_START[\s\S]*?; <<< ALBARQ_IVR_AUTO_END\n?/m;
  return re.test(content) ? content.replace(re, block) : `${content.trim()}\n\n${block}`;
}

function routeFromTg400ToIvr(content: string) {
  const re = /exten => 7000,1,NoOp\(Call Center incoming GSM call\)[\s\S]*? same => n,Hangup\(\)/m;
  const replacement = [
    'exten => 7000,1,NoOp(Call Center incoming GSM call -> IVR)',
    ' same => n,Goto(cc-ivr-main,s,1)',
  ].join('\n');

  if (!re.test(content)) return content;
  return content.replace(re, replacement);
}


function mapQueueStrategy(strategy?: string | null) {
  const s = String(strategy || 'ringall');
  if (s === 'roundrobin') return 'rrmemory';
  if (s === 'linear') return 'linear';
  if (s === 'leastrecent') return 'leastrecent';
  return 'ringall';
}

async function buildQueuesConf() {
  const queues = await prisma.queue.findMany({
    include: {
      members: {
        include: {
          agent: { include: { extension: true } },
        },
        orderBy: { penalty: 'asc' },
      },
    },
    orderBy: { number: 'asc' },
  });

  const lines: string[] = [];
  lines.push('; >>> ALBARQ_QUEUE_AUTO_START');
  lines.push('; Generated from Call Center DB. Do not edit manually.');
  lines.push('');

  for (const q of queues) {
    const qnum = safeDialplanValue(q.number);
    if (!qnum) continue;

    lines.push(`[${qnum}]`);
    lines.push('musicclass=queue_wait');
    lines.push(`strategy=${mapQueueStrategy(q.strategy)}`);
    lines.push('timeout=15');
    lines.push('retry=3');
    lines.push('wrapuptime=5');
    lines.push('ringinuse=no');
    lines.push('joinempty=yes');
    lines.push('leavewhenempty=no');
    lines.push('announce-frequency=0');
    lines.push('setinterfacevar=yes');
    lines.push('setqueuevar=yes');
    lines.push('setqueueentryvar=yes');

    for (const m of q.members || []) {
      const ext = safeDialplanValue(m.agent.extension?.sipUsername || m.agent.extension?.number);
      if (!ext) continue;
      const name = String(m.agent.name || ext).replace(/[,;\n\r]/g, ' ');
      lines.push(`member => PJSIP/${ext},${Number(m.penalty || 0)},${name},PJSIP/${ext}`);
    }

    lines.push('');
  }

  lines.push('; <<< ALBARQ_QUEUE_AUTO_END');
  lines.push('');
  return lines.join('\n');
}

function ensureQueuesInclude(fs: typeof import('node:fs')) {
  const main = '/etc/asterisk/queues.conf';
  const includeLine = '#include queues_callcenter.conf';

  let content = fs.readFileSync(main, 'utf8');
  if (!content.includes(includeLine)) {
    fs.copyFileSync(main, `/etc/asterisk/queues.conf.bak.${Date.now()}`);
    content = `${content.trim()}\n\n${includeLine}\n`;
    fs.writeFileSync(main, content);
  }
}


export async function apply(req: Request, res: Response) {
  const menu = await prisma.ivrMenu.findUnique({
    where: { id: req.params.id },
    include: { options: true, greetingPrompt: true },
  });

  if (!menu) throw ApiError.notFound('IVR menu not found');
  if (!menu.active) throw new Error('Cannot apply inactive IVR menu');

  const fs = await import('node:fs');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');

  if (menu.greetingPrompt?.fileName) {
    const src = path.join('/var/lib/asterisk/sounds/custom', path.basename(menu.greetingPrompt.fileName));
    const dst = '/var/lib/asterisk/moh/ivr_main.wav';

    if (fs.existsSync(src)) {
      execFileSync('ffmpeg', [
        '-y',
        '-i', src,
        '-filter:a', 'highpass=f=120,loudnorm=I=-16:TP=-1.5:LRA=11,volume=2',
        '-ar', '8000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        dst,
      ]);
    }
  }

  ensureQueuesInclude(fs);
  fs.writeFileSync('/etc/asterisk/queues_callcenter.conf', await buildQueuesConf());

  const file = '/etc/asterisk/extensions.conf';
  const backup = `/etc/asterisk/extensions.conf.bak.ivr.${Date.now()}`;

  let content = fs.readFileSync(file, 'utf8');
  fs.copyFileSync(file, backup);

  const block = await buildIvrDialplan(menu);
  content = replaceAutoBlock(content, block);
  content = routeFromTg400ToIvr(content);

  fs.writeFileSync(file, content);

  let reloadOk = false;
  try {
    execFileSync('asterisk', ['-rx', 'queue reload all']);
    execFileSync('asterisk', ['-rx', 'dialplan reload']);
    reloadOk = true;
  } catch {
    reloadOk = false;
  }

  res.json({
    success: true,
    reloadOk,
    backup,
    context: 'cc-ivr-main',
    message: reloadOk
      ? 'IVR applied and Asterisk dialplan reloaded'
      : 'IVR applied. Run: asterisk -rx "dialplan reload"',
  });
}
