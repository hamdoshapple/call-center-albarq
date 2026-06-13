import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { searchSubscriberCache } from '../services/subscriber-cache.service.js';

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

function money(v: unknown) {
  const n = Number(v || 0);
  return n > 0 ? n.toLocaleString('en-US') : '0';
}

function clean(v: unknown, max = 80) {
  return String(v || '')
    .replace(/NULL/gi, '')
    .replace(/[\r\n"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function callerName(req: Request, res: Response) {
  const expected = process.env.INTERNAL_CALLER_TOKEN || '';
  const provided = String(req.query.t || req.get('x-internal-token') || '');

  if (!expected || provided !== expected) {
    return res.status(404).type('text/plain').send('');
  }

  const phone = norm(req.query.phone || req.query.caller);
  if (!phone) return res.type('text/plain').send('');

  const local = await prisma.subscriber.findFirst({
    where: {
      OR: variants(phone).map((v) => ({ phone: { contains: v } })),
    },
    select: { name: true, pppoeUsername: true, debt: true },
  });

  let name = clean(local?.name || local?.pppoeUsername || '');
  let debt = Number(local?.debt || 0);

  if (!name && process.env.EXTERNAL_MSSQL_ENABLED === 'true') {
    const cached = await searchSubscriberCache(phone);
    const sub = cached[0];
    if (sub) {
      name = clean(sub.name || sub.pppoeUsername || '');
      debt = Number(sub.debt || 0);
    }
  }

  if (!name) name = phone;

  const display = debt > 0
    ? `${name} | دين: ${money(debt)}`
    : name;

  res.type('text/plain').send(clean(display, 80));
}
