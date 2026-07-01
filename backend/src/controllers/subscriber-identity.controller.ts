import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { searchExternalSubscribers } from '../services/external-subscriber.service.js';
import { searchSubscriberCache } from '../services/subscriber-cache.service.js';

function id() {
  return crypto.randomUUID();
}

function norm(v: unknown) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) d = '0' + d.slice(3);
  if (!d.startsWith('0') && d.length === 10) d = '0' + d;
  return d;
}

async function getFreshSubscriber(q: string) {
  const live = await searchExternalSubscribers(q).catch(() => []);
  if (live?.length) return { source: 'live_sql', row: live[0], rows: live };

  const cached = await searchSubscriberCache(q).catch(() => []);
  if (cached?.length) return { source: 'cache', row: cached[0], rows: cached };

  return { source: 'none', row: null, rows: [] };
}

export async function resolve(req: Request, res: Response) {
  const phoneNorm = norm(req.query.phone || req.query.q);
  if (!phoneNorm) return res.json({ matched: false, reason: 'NO_PHONE' });

  const aliasRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM SubscriberContactAlias WHERE phoneNorm=? LIMIT 1`,
    phoneNorm
  ).catch(() => []);

  const alias = aliasRows[0] || null;

  if (alias) {
    const key = alias.pppoeUsername || alias.externalId || alias.subscriberId || phoneNorm;
    const fresh = await getFreshSubscriber(key);

    return res.json({
      matched: true,
      via: 'alias',
      phoneNorm,
      alias,
      dataSource: fresh.source,
      subscriber: fresh.row,
      accounts: fresh.rows,
    });
  }

  const direct = await getFreshSubscriber(phoneNorm);

  return res.json({
    matched: Boolean(direct.row),
    via: direct.row ? 'direct_phone' : 'none',
    phoneNorm,
    dataSource: direct.source,
    subscriber: direct.row,
    accounts: direct.rows,
  });
}

export async function link(req: Request, res: Response) {
  const user: any = (req as any).user || {};
  const phoneNorm = norm(req.body?.phone || req.body?.phoneNorm);
  const pppoeUsername = String(req.body?.pppoeUsername || '').trim() || null;
  const externalId = String(req.body?.externalId || '').trim() || null;
  const subscriberId = String(req.body?.subscriberId || '').trim() || null;
  const label = String(req.body?.label || '').trim() || null;
  const verified = req.body?.verified === true ? 1 : 0;

  if (!phoneNorm) return res.status(400).json({ message: 'phone required' });
  if (!pppoeUsername && !externalId && !subscriberId) {
    return res.status(400).json({ message: 'subscriber key required' });
  }

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO SubscriberContactAlias
      (id, phoneNorm, label, pppoeUsername, externalId, subscriberId, verified, source, createdById)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)
    ON DUPLICATE KEY UPDATE
      label=VALUES(label),
      pppoeUsername=VALUES(pppoeUsername),
      externalId=VALUES(externalId),
      subscriberId=VALUES(subscriberId),
      verified=VALUES(verified),
      updatedAt=NOW(3)
    `,
    id(),
    phoneNorm,
    label,
    pppoeUsername,
    externalId,
    subscriberId,
    verified,
    user.id || user.userId || null
  );

  res.json({ ok: true, phoneNorm });
}

export async function aliases(req: Request, res: Response) {
  const key = String(req.query.key || req.query.pppoeUsername || req.query.externalId || '').trim();
  if (!key) return res.json([]);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT *
    FROM SubscriberContactAlias
    WHERE pppoeUsername=? OR externalId=? OR subscriberId=?
    ORDER BY isPrimary DESC, updatedAt DESC
    `,
    key, key, key
  ).catch(() => []);

  res.json(rows);
}
