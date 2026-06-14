import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { searchSubscriberCache } from '../services/subscriber-cache.service.js';
import { searchExternalSubscribers } from '../services/external-subscriber.service.js';

const CODE = '123456';

function norm(v: unknown) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) return '0' + d.slice(3);
  return d;
}

function clean(v: unknown) {
  return String(v || '').replace(/NULL/gi, '').replace(/\s+/g, ' ').trim();
}

function secret() {
  return process.env.SUBSCRIBER_PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'subscriber-portal-secret';
}

function sign(phone: string) {
  return jwt.sign({ phone, type: 'subscriber' }, secret(), { expiresIn: '30d' });
}

function verify(req: Request) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return jwt.verify(token, secret()) as { phone: string; type: string };
}

export async function requestCode(req: Request, res: Response) {
  const phone = norm(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  res.json({
    ok: true,
    message: 'تم إرسال رمز التحقق',
    devCode: CODE,
  });
}

export async function login(req: Request, res: Response) {
  const phone = norm(req.body?.phone);
  const code = String(req.body?.code || '');

  if (!phone) return res.status(400).json({ error: 'Phone is required' });
  if (code !== CODE) return res.status(401).json({ error: 'Invalid code' });

  res.json({ token: sign(phone), phone });
}

export async function accounts(req: Request, res: Response) {
  const payload = verify(req);
  const phone = norm(payload.phone);

  const local = await prisma.subscriber.findMany({
    where: { phone: { contains: phone } },
    orderBy: { debt: 'desc' },
  });

  let external: any[] = [];
  try {
    external = await searchExternalSubscribers(phone);
  } catch {
    external = [];
  }

  const cached = external.length ? [] : await searchSubscriberCache(phone);

  const rows = [
    ...local.map((x) => ({ ...x, source: 'local' })),
    ...external.map((x: any) => ({ ...x, source: 'live' })),
    ...cached.map((x: any) => ({ ...x, source: 'cache' })),
  ];

  const unique = new Map<string, any>();
  for (const x of rows) {
    const key = `${x.source}-${x.id || x.externalId || x.pppoeUsername || x.phone}`;
    unique.set(key, {
      id: String(x.id || x.externalId || key),
      name: clean(x.name || x.pppoeUsername || 'مشترك'),
      phone: clean(x.phone || phone),
      pppoeUsername: clean(x.pppoeUsername || ''),
      status: x.status || 'active',
      package: clean(x.package || '—'),
      speed: clean(x.speed || '—'),
      expiration: x.expiration || null,
      debt: Number(x.debt || 0),
      address: clean(x.address || '—'),
      notes: clean(x.notes || ''),
      source: x.source,
    });
  }

  res.json([...unique.values()]);
}

export async function me(req: Request, res: Response) {
  const payload = verify(req);
  res.json({ phone: payload.phone });
}
