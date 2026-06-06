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

function optionDialplan(option: any) {
  const value = safeDialplanValue(option.destinationValue || option.destinationId);
  const label = String(option.label || option.key || '').replace(/"/g, '');

  switch (option.destinationType) {
    case 'agent':
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> agent ${value})`,
        ` same => n,Dial(PJSIP/${value || '102'},30)`,
        ` same => n,Hangup()`,
      ].join('\n');

    case 'external':
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> external ${value})`,
        ` same => n,Dial(PJSIP/${value}@20001,60)`,
        ` same => n,Hangup()`,
      ].join('\n');

    case 'ivr':
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> nested IVR ${value})`,
        ` same => n,Goto(cc-ivr-${value || 'main'},s,1)`,
      ].join('\n');

    case 'hangup':
      return [
        ' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/goodbye.wav)}"="1"]?Playback(/var/lib/asterisk/moh/goodbye))',
        ` same => n,Hangup()`,
      ].join('\n');

    case 'voicemail':
      return [
        ` same => n,Playback(vm-nobodyavail)`,
        ` same => n,Hangup()`,
      ].join('\n');

    case 'queue':
    case 'department': {
      const groups: Record<string, string> = {
        '2009': 'PJSIP/33&PJSIP/101&PJSIP/202',
        '2000': 'PJSIP/101',
        '2001': 'PJSIP/202',
        '2002': 'PJSIP/33',
      };

      const dialTarget = groups[value] || 'PJSIP/33&PJSIP/101&PJSIP/202';

      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> queue/group ${value})`,
        ` same => n,Dial(${dialTarget},30)`,
        ' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/busy.wav)}"="1"]?Playback(/var/lib/asterisk/moh/busy))',
        ` same => n,Hangup()`,
      ].join('\n');
    }

    default:
      return [
        ` same => n,NoOp(IVR ${option.key}: ${label} -> default agents)`,
        ` same => n,Dial(PJSIP/33&PJSIP/101&PJSIP/202,30)`,
        ' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/busy.wav)}"="1"]?Playback(/var/lib/asterisk/moh/busy))',
        ` same => n,Hangup()`,
      ].join('\n');
  }
}

function buildIvrDialplan(menu: any) {
  const timeout = Number(menu.timeout || 10);
  const maxRepeats = Number(menu.maxRepeats || 3);
  const promptSound = 'ivr_main';

  const lines: string[] = [];

  lines.push('; >>> ALBARQ_IVR_AUTO_START');
  lines.push('[cc-ivr-main]');
  lines.push('exten => s,1,NoOp(Albarq IVR Main)');
  lines.push(' same => n,Answer()');
  lines.push(` same => n,Set(IVR_REPEATS=0)`);
  lines.push(' same => n(start),NoOp(Playing IVR prompt)');
  lines.push(' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/' + promptSound + '.wav)}"="1"]?Background(/var/lib/asterisk/moh/' + promptSound + '))');
  lines.push(` same => n,WaitExten(${timeout})`);

  for (const option of menu.options || []) {
    const key = safeDialplanValue(option.key);
    if (!key) continue;
    lines.push(`exten => ${key},1,NoOp(IVR option ${key})`);
    lines.push(optionDialplan(option));
  }

  lines.push('exten => t,1,NoOp(IVR timeout)');
  lines.push(` same => n,Set(IVR_REPEATS=$[${'${IVR_REPEATS}'} + 1])`);
  lines.push(` same => n,GotoIf($[${'${IVR_REPEATS}'} < ${maxRepeats}]?s,start)`);
  lines.push(' same => n,ExecIf($["${STAT(e,/var/lib/asterisk/moh/queue_wait.wav)}"="1"]?Playback(/var/lib/asterisk/moh/queue_wait))');
  lines.push(' same => n,Hangup()');

  lines.push('exten => i,1,NoOp(IVR invalid option)');
  lines.push(` same => n,Set(IVR_REPEATS=$[${'${IVR_REPEATS}'} + 1])`);
  lines.push(` same => n,GotoIf($[${'${IVR_REPEATS}'} < ${maxRepeats}]?s,start)`);
  lines.push(' same => n,Hangup()');
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

  const file = '/etc/asterisk/extensions.conf';
  const backup = `/etc/asterisk/extensions.conf.bak.ivr.${Date.now()}`;

  let content = fs.readFileSync(file, 'utf8');
  fs.copyFileSync(file, backup);

  const block = buildIvrDialplan(menu);
  content = replaceAutoBlock(content, block);
  content = routeFromTg400ToIvr(content);

  fs.writeFileSync(file, content);

  let reloadOk = false;
  try {
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
