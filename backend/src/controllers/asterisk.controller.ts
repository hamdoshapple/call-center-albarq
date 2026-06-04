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

const controlSchema = z.object({ uniqueId: z.string().min(1), target: z.string().optional(), attended: z.boolean().optional() });

export async function control(req: Request, res: Response) {
  const gw = getAsteriskGateway();
  const action = req.params.action;
  const body = controlSchema.partial().parse(req.body);

  switch (action) {
    case 'answer': await gw.answer(body.uniqueId!); break;
    case 'hangup': await gw.hangup(body.uniqueId!); break;
    case 'hold': await gw.hold(body.uniqueId!); break;
    case 'unhold': await gw.unhold(body.uniqueId!); break;
    case 'transfer': await gw.transfer(body.uniqueId!, body.target!, body.attended); break;
    default: return res.status(400).json({ error: `Unknown action: ${action}` });
  }
  res.json({ success: true });
}
