// @ts-nocheck
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { getAsteriskGateway } from '../asterisk/index.js';
import { searchExternalSubscribers } from '../services/external-subscriber.service.js';
import { searchSubscriberCache, upsertExternalSubscriberCache } from '../services/subscriber-cache.service.js';

function normalizeLogPhone(v?: string | null) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('00964')) n = n.slice(5);
  else if (n.startsWith('964')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return n;
}

function isRealMobile(v?: string | null) {
  const n = normalizeLogPhone(v);
  return n.length >= 10 && n.startsWith('7');
}

async function findCachedSubscriberForCall(phone?: string | null) {
  const n = normalizeLogPhone(phone);
  if (!n || n.length < 10) return null;

  const cachedRows = await searchSubscriberCache(n);
  return cachedRows.find((x: any) => {
    const p = normalizeLogPhone(x.phone);
    const u = normalizeLogPhone(x.pppoeUsername);
    return (p.length >= 10 && p === n) || (u.length >= 10 && u === n);
  }) || null;
}


export async function listLogs(req: Request, res: Response) {
  const { search, direction, disposition, agentId, queueId, from, to } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 100)));

  const isAgent = req.user?.role === 'agent';

  const where = {
    OR: search ? [
      { callerNumber: { contains: search } },
      { destinationNumber: { contains: search } },
    ] : undefined,
    direction: direction || undefined,
    disposition: disposition || undefined,
    agentId: isAgent ? req.user?.agentId : (agentId || undefined),
    queueId: queueId || undefined,
    startedAt:
      from || to
        ? {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          }
        : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
        recording: { select: { id: true, callerNumber: true, fileName: true } },
      },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const mapped = await Promise.all(rows.map(async (r: any) => {
    const effectiveCaller =
      [r.callerNumber, r.recording?.callerNumber, r.destinationNumber].find((x) => isRealMobile(x)) ||
      r.callerNumber;

    const subscriber = await findCachedSubscriberForCall(effectiveCaller);

    return {
      ...r,
      callerNumber: effectiveCaller,
      callerName: subscriber?.name ?? null,
      subscriberId: subscriber?.id ?? null,
      subscriberName: subscriber?.name ?? null,
      subscriber: subscriber ? {
        id: subscriber.id,
        name: subscriber.name,
        phone: subscriber.phone,
        pppoeUsername: subscriber.pppoeUsername,
        status: subscriber.status,
        package: subscriber.package,
        speed: subscriber.speed,
        expiration: subscriber.expiration,
        debt: subscriber.debt,
        address: subscriber.address,
      } : null,
    };
  }));

  const realMobiles = new Set(
    mapped
      .filter((r: any) => isRealMobile(r.callerNumber))
      .map((r: any) => String(r.uniqueId || '').split('.')[0])
  );

  const cleaned = mapped.filter((r: any) => {
    const base = String(r.uniqueId || '').split('.')[0];
    const trunkGarbage =
      ['20001', '2000', '7000'].includes(String(r.callerNumber)) ||
      ['s', '7000'].includes(String(r.destinationNumber));
    return !(trunkGarbage && realMobiles.has(base));
  });

  res.json({ total: cleaned.length, page, pageSize, rows: cleaned });
}

export async function getLive(req: Request, res: Response) {
  const gw = getAsteriskGateway();
  const allCalls = await gw.getLiveCalls();

  const calls = req.user?.role === 'agent' && req.user?.extension
    ? allCalls.filter((c) => c.agentExtension === req.user?.extension)
    : allCalls;

  const normalizePhone = (v: string) => {
    const digits = String(v || '').replace(/\D/g, '');
    if (digits.startsWith('964')) return `0${digits.slice(3)}`;
    return digits;
  };

  const phones = [...new Set(calls.map((c) => normalizePhone(c.callerNumber)).filter(Boolean))];

  const externalResults = process.env.EXTERNAL_MSSQL_ENABLED === 'true'
    ? await Promise.all(phones.map(async (phone) => {
        const liveRows = await searchExternalSubscribers(phone);

        if (liveRows.length) {
          await upsertExternalSubscriberCache(liveRows);
          return {
            rows: liveRows,
            source: 'live',
            warning: null,
          };
        }

        const cachedRows = await searchSubscriberCache(phone);
        return {
          rows: cachedRows,
          source: cachedRows.length ? 'cache' : 'none',
          warning: cachedRows.length ? 'using_subscriber_cache' : 'not_found',
        };
      }))
    : [];

  const externalSubscribers = externalResults.flatMap((x) => x.rows);
  const sourceByPhone = new Map(
    externalResults.flatMap((x) => x.rows.map((s) => [normalizePhone(s.phone), {
      source: x.source,
      warning: x.warning,
      cachedAt: s.cache?.cachedAt ?? null,
      ageSec: s.cache?.ageSec ?? null,
    }]))
  );

  const externalByPhone = new Map(
    externalSubscribers.map((s) => [normalizePhone(s.phone), s])
  );

  const variants = [...new Set(
    phones.flatMap((p) => [
      p,
      p.replace(/^0/, '964'),
      `+${p.replace(/^0/, '964')}`,
    ])
  )];

  const subscribers = variants.length
    ? await prisma.subscriber.findMany({
        where: { phone: { in: variants } },
        select: {
          id: true,
          name: true,
          phone: true,
          pppoeUsername: true,
          status: true,
          package: true,
          speed: true,
          expiration: true,
          debt: true,
          address: true,
        },
      })
    : [];

  const subsByPhone = new Map<string, typeof subscribers>();
  for (const s of subscribers) {
    const key = normalizePhone(s.phone);
    const arr = subsByPhone.get(key) ?? [];
    arr.push(s);
    subsByPhone.set(key, arr);
  }

  const subscriberIds = subscribers.map((s) => s.id);

  const [ticketGroups, callGroups, lastTickets, lastCalls] = subscriberIds.length
    ? await Promise.all([
        prisma.ticket.groupBy({
          by: ['subscriberId'],
          where: { subscriberId: { in: subscriberIds } },
          _count: { _all: true },
        }),
        prisma.call.groupBy({
          by: ['subscriberId'],
          where: { subscriberId: { in: subscriberIds } },
          _count: { _all: true },
        }),
        prisma.ticket.findMany({
          where: { subscriberId: { in: subscriberIds } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.call.findMany({
          where: { subscriberId: { in: subscriberIds } },
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
      ])
    : [[], [], [], []];

  const ticketCount = new Map(ticketGroups.map((x) => [x.subscriberId, x._count._all]));
  const callCount = new Map(callGroups.map((x) => [x.subscriberId, x._count._all]));
  const lastTicketBySub = new Map();
  const lastCallBySub = new Map();

  for (const t of lastTickets) if (!lastTicketBySub.has(t.subscriberId)) lastTicketBySub.set(t.subscriberId, t);
  for (const c of lastCalls) if (c.subscriberId && !lastCallBySub.has(c.subscriberId)) lastCallBySub.set(c.subscriberId, c);

  res.json(
    calls.map((c) => {
      const phoneKey = normalizePhone(c.callerNumber);
      const externalSub = externalByPhone.get(phoneKey);
      const sourceInfo = sourceByPhone.get(phoneKey);
      const localMatches = subsByPhone.get(phoneKey) ?? [];
      const subscriberMatches = externalSub ? [externalSub] : localMatches;
      const sub = subscriberMatches.length === 1 ? subscriberMatches[0] : null;

      return {
        id: c.uniqueId,
        callerNumber: c.callerNumber,
        callerName: sub?.name ?? null,
        subscriberId: sub?.id ?? null,
        subscriber: sub ? {
          id: sub.id,
          name: sub.name,
          phone: sub.phone,
          pppoeUsername: sub.pppoeUsername,
          status: sub.status,
          package: sub.package,
          speed: sub.speed,
          expiration: sub.expiration,
          debt: sub.debt,
          address: sub.address,
        } : null,
        subscriberMatches: subscriberMatches.map((x) => ({
          id: x.id,
          name: x.name,
          phone: x.phone,
          pppoeUsername: x.pppoeUsername,
          status: x.status,
          package: x.package,
          speed: x.speed,
          expiration: x.expiration,
          debt: x.debt,
          address: x.address,
        })),
        hasMultipleSubscribers: subscriberMatches.length > 1,
        dataSource: sourceInfo ?? null,
        crm: sub ? {
          ticketsCount: externalSub ? 0 : (ticketCount.get(sub.id) ?? 0),
          callsCount: externalSub ? 0 : (callCount.get(sub.id) ?? 0),
          lastTicket: externalSub ? null : (lastTicketBySub.get(sub.id) ?? null),
          lastCall: externalSub ? null : (lastCallBySub.get(sub.id) ?? null),
          hasHighDebt: Number(sub.debt || 0) >= 50000,
        } : null,
        destinationNumber: c.destinationNumber,
        direction: c.direction,
        status: c.status,
        agentExtension: c.agentExtension ?? null,
        queue: c.queue ?? null,
        line: c.line ?? null,
        startedAt: c.startedAt,
        durationSec: c.durationSec,
      };
    })
  );
}

const noteSchema = z.object({ note: z.string().min(1) });

export async function addNote(req: Request, res: Response) {
  const { note } = noteSchema.parse(req.body);
  const liveId = req.params.id;

  const call = await prisma.call.findUnique({ where: { id: liveId } });

  if (call) {
    await prisma.call.update({ where: { id: call.id }, data: { note } });
    await prisma.callEvent.create({
      data: {
        callId: call.id,
        type: 'note',
        detail: note,
        actor: req.user?.username,
      },
    });

    return res.json({ success: true, storedAs: 'call', id: call.id });
  }

  await prisma.note.create({
    data: {
      refType: 'live_call',
      refId: liveId,
      body: note,
      authorId: req.user?.id,
    },
  });

  res.json({ success: true, storedAs: 'live_call', id: liveId });
}
