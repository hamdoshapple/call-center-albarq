import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { searchSubscriberCache } from '../services/subscriber-cache.service.js';
import { searchExternalSubscribers } from '../services/external-subscriber.service.js';
import { sendPushToEmployees } from './push.controller.js';

function norm(v: unknown) {
  return String(v || '').replace(/[^\d+]/g, '');
}

function variants(phone: string) {
  const p = norm(phone);
  const d = p.replace(/^\+/, '');
  const set = new Set<string>([p, d]);
  if (d.startsWith('964')) set.add('0' + d.slice(3));
  if (d.startsWith('0')) set.add('964' + d.slice(1));
  return [...set].filter(Boolean);
}

function clean(v: unknown, max = 80) {
  return String(v || '')
    .replace(/NULL/gi, '')
    .replace(/[\r\n"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function notifyIncomingCall(phone: string, displayName: string, ext?: string) {
  const extension = String(ext || '').replace(/\D/g, '');
  if (!extension) return;

  try {
    const user = await prisma.user.findFirst({
      where: {
        active: true,
        agent: {
          extension: {
            number: extension,
          },
        },
      },
      select: { id: true },
    });

    if (!user?.id) return;

    const key = `incoming_call_push_${user.id}_${phone}_${extension}`;
    const last = Number((globalThis as any)[key] || 0);
    if (Date.now() - last < 45000) return;
    (globalThis as any)[key] = Date.now();

    await sendPushToEmployees(
      'مكالمة واردة مباشرة',
      `${displayName || phone} يتصل الآن`,
      `/employee/calls?call=${encodeURIComponent(phone)}`,
      {
        employeeIds: [user.id],
        callId: phone,
        type: 'live_call',
        tag: `incoming-call-${user.id}-${phone}`,
      }
    );
  } catch (e: any) {
    console.error('[internal-caller-call-push]', e?.message || e);
  }
}

export async function callerName(req: Request, res: Response) {
  const expected = process.env.INTERNAL_CALLER_TOKEN || '';
  const provided = String(req.query.t || req.get('x-internal-token') || '');

  if (!expected || provided !== expected) {
    return res.status(404).type('text/plain').send('');
  }

  const phone = norm(req.query.phone || req.query.caller);
  if (!phone) return res.type('text/plain').send('');

  const aliasRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM SubscriberContactAlias WHERE phoneNorm=? LIMIT 1`,
    phone
  ).catch(() => []);

  const alias = aliasRows[0] || null;

  let name = '';
  let debt = 0;

  if (alias) {
    const key = alias.pppoeUsername || alias.externalId || alias.subscriberId || phone;

    let rows: any[] = [];
    if (process.env.EXTERNAL_MSSQL_ENABLED === 'true') {
      rows = await searchExternalSubscribers(key).catch(() => []);
    }
    if (!rows.length) rows = await searchSubscriberCache(key).catch(() => []);

    const sub = rows[0];
    if (sub) {
      name = clean(sub.name || sub.pppoeUsername || key);
      debt = Number(sub.debt || 0);
    }
  }

  if (!name) {
    const locals = await prisma.subscriber.findMany({
      where: {
        OR: variants(phone).map((v) => ({ phone: { contains: v } })),
      },
      select: { name: true, pppoeUsername: true, debt: true },
    });

    name = clean(locals[0]?.name || locals[0]?.pppoeUsername || '');
    debt = locals.reduce((sum, s) => sum + Number(s.debt || 0), 0);
  }

  if (!name && process.env.EXTERNAL_MSSQL_ENABLED === 'true') {
    const live = await searchExternalSubscribers(phone).catch(() => []);
    const cached = live.length ? [] : await searchSubscriberCache(phone).catch(() => []);
    const sub = live[0] || cached[0];
    if (sub) {
      name = clean(sub.name || sub.pppoeUsername || '');
      debt = Number(sub.debt || 0);
    }
  }

  if (!name) name = phone;

  const display = debt > 0
    ? `${name} - دين ${Math.trunc(debt)}`
    : name;

  const ext = String(req.query.ext || req.query.extension || req.query.dst || '');
  await notifyIncomingCall(phone, clean(display, 80), ext).catch(() => null);

  res.type('text/plain').send(clean(display, 80));
}
