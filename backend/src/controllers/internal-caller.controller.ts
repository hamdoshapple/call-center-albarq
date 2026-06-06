import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

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

export async function callerName(req: Request, res: Response) {
  const expected = process.env.INTERNAL_CALLER_TOKEN || '';
  const provided = String(req.query.t || req.get('x-internal-token') || '');

  if (!expected || provided !== expected) {
    return res.status(404).type('text/plain').send('');
  }

  const phone = norm(req.query.phone || req.query.caller);
  if (!phone) return res.type('text/plain').send('');

  const sub = await prisma.subscriber.findFirst({
    where: {
      OR: variants(phone).map((v) => ({ phone: { contains: v } })),
    },
    select: { name: true, pppoeUsername: true },
  });

  const name = (sub?.name || sub?.pppoeUsername || phone)
    .replace(/[\r\n"<>]/g, ' ')
    .trim()
    .slice(0, 60);

  res.type('text/plain').send(name);
}
