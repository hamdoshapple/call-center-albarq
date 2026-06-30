import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { getExternalSubscriberById, searchExternalSubscribers } from '../services/external-subscriber.service.js';
import { getCachedExternalSubscriberById, refreshExternalSubscriberCache, searchSubscriberCache, subscriberCacheStatus, upsertExternalSubscriberCache } from '../services/subscriber-cache.service.js';

import { sendPushToEmployees } from './push.controller.js';
const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  pppoeUsername: z.string().optional(),
  status: z.enum(['active', 'expired', 'suspended', 'disabled']).optional(),
  package: z.string().optional(),
  speed: z.string().optional(),
  expiration: z.string().optional(),
  debt: z.number().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function search(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  const source = String(req.query.source ?? 'auto');

  if (source === 'cache') {
    return res.json(await searchSubscriberCache(q));
  }

  if (process.env.EXTERNAL_MSSQL_ENABLED === 'true') {
    const externalRows = await searchExternalSubscribers(q);
    if (externalRows.length) {
      await upsertExternalSubscriberCache(externalRows);
      return res.json(externalRows.map((x) => ({ ...x, cache: { source: 'live' } })));
    }

    const cachedRows = await searchSubscriberCache(q);
    if (cachedRows.length) return res.json(cachedRows);
    return res.json([]);
  }

  const rows = await prisma.subscriber.findMany({
    where: q
      ? { OR: [{ phone: { contains: q } }, { name: { contains: q } }, { pppoeUsername: { contains: q } }] }
      : undefined,
    take: 50,
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows);
}

export async function getOne(req: Request, res: Response) {
  if (req.params.id.startsWith('ext-')) {
    const external = await getExternalSubscriberById(req.params.id);
    if (external) {
      await upsertExternalSubscriberCache([external]);
      return res.json({ ...external, cache: { source: 'live' }, tickets: [] });
    }

    const cached = await getCachedExternalSubscriberById(req.params.id);
    if (!cached) throw ApiError.notFound('Subscriber not found');
    return res.json({ ...cached, tickets: [] });
  }

  const row = await prisma.subscriber.findUnique({
    where: { id: req.params.id },
    include: { tickets: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw ApiError.notFound('Subscriber not found');
  res.json(row);
}

export async function getTickets(req: Request, res: Response) {
  const isExternal = req.params.id.startsWith('ext-');

  const where = isExternal
    ? (
        req.user?.role === 'agent' && req.user?.agentId
          ? {
              externalId: req.params.id,
              OR: [
                { agentId: req.user.agentId },
                { agentId: null },
              ],
            }
          : { externalId: req.params.id }
      )
    : (
        req.user?.role === 'agent' && req.user?.agentId
          ? {
              subscriberId: req.params.id,
              OR: [
                { agentId: req.user.agentId },
                { agentId: null },
              ],
            }
          : { subscriberId: req.params.id }
      );

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const notes = rows.length
    ? await prisma.note.findMany({
        where: {
          refType: 'ticket',
          refId: { in: rows.map((t) => t.id) },
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const notesByTicket = new Map<string, typeof notes>();

  for (const note of notes) {
    const list = notesByTicket.get(note.refId) ?? [];
    list.push(note);
    notesByTicket.set(note.refId, list);
  }

  res.json(
    rows.map((ticket) => ({
      ...ticket,
      notes: (notesByTicket.get(ticket.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }))
  );
}



async function getCacheScheduleSettings() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'subscribersCacheIntervalMinutes',
          'subscribersCacheFinalTime',
          'subscribersCacheLimit',
        ],
      },
    },
  });

  const map = new Map(rows.map((x) => [x.key, x.value]));

  return {
    intervalMinutes: Number(map.get('subscribersCacheIntervalMinutes') || 15),
    finalTime: String(map.get('subscribersCacheFinalTime') || '22:00'),
    limit: Number(map.get('subscribersCacheLimit') || 7000),
  };
}

export async function updateCacheScheduleSettings(req: Request, res: Response) {
  const intervalMinutes = Math.max(1, Math.min(1440, Number(req.body?.intervalMinutes || 15)));
  const limit = Math.max(1, Math.min(100000, Number(req.body?.limit || 7000)));
  const finalTime = String(req.body?.finalTime || '22:00');

  if (!/^\d{2}:\d{2}$/.test(finalTime)) {
    return res.status(400).json({ error: 'finalTime must be HH:mm مثل 22:00' });
  }

  await prisma.setting.upsert({
    where: { key: 'subscribersCacheIntervalMinutes' },
    create: { key: 'subscribersCacheIntervalMinutes', value: intervalMinutes },
    update: { value: intervalMinutes },
  });

  await prisma.setting.upsert({
    where: { key: 'subscribersCacheFinalTime' },
    create: { key: 'subscribersCacheFinalTime', value: finalTime },
    update: { value: finalTime },
  });

  await prisma.setting.upsert({
    where: { key: 'subscribersCacheLimit' },
    create: { key: 'subscribersCacheLimit', value: limit },
    update: { value: limit },
  });

  res.json({
    ok: true,
    intervalMinutes,
    finalTime,
    limit,
    message: 'تم حفظ إعدادات تحديث الكاش',
  });
}

export async function cacheStatus(_req: Request, res: Response) {
  const status = await subscriberCacheStatus();
  const schedule = await getCacheScheduleSettings();

  res.json({
    ...status,
    schedule,
  });
}

export async function refreshCache(req: Request, res: Response) {
  const schedule = await getCacheScheduleSettings();
  const limit = Math.min(100000, Math.max(1, Number(req.body?.limit || schedule.limit || 7000)));
  const result = await refreshExternalSubscriberCache(limit);

  if (!result.count) {
    const status = await subscriberCacheStatus();
    return res.json({
      ...result,
      ok: false,
      message: 'لم يتم تحديث الكاش لأن مصدر live غير متاح حالياً، وتم الإبقاء على الكاش القديم.',
      existingCacheCount: status.count,
      newestCachedAt: status.newestCachedAt,
      oldestCachedAt: status.oldestCachedAt,
    });
  }

  res.json({
    ...result,
    ok: true,
    message: 'تم تحديث كاش المشتركين بنجاح.',
  });
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.subscriber.create({
    data: { ...data, expiration: data.expiration ? new Date(data.expiration) : null },
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.subscriber.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Subscriber not found');
  const row = await prisma.subscriber.update({
    where: { id: req.params.id },
    data: { ...data, expiration: data.expiration ? new Date(data.expiration) : undefined },
  });
  res.json(row);
}


const ticketSchema = z.object({
  subject: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  call: z.object({
    callerNumber: z.string().optional(),
    callerName: z.string().optional().nullable(),
    startedAt: z.string().optional(),
    agentExtension: z.string().optional().nullable(),
    line: z.string().optional().nullable(),
    destinationNumber: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
});

export async function createTicket(req: Request, res: Response) {
  const data = ticketSchema.parse(req.body);
  const c = data.call;
  const safeSubject = data.subject.slice(0, 180);

  let subscriber: any = null;
  let external = false;

  if (req.params.id.startsWith('ext-')) {
    subscriber =
      await getExternalSubscriberById(req.params.id) ||
      await getCachedExternalSubscriberById(req.params.id);

    if (!subscriber) {
      throw ApiError.notFound('Subscriber not found');
    }

    external = true;
  } else {
    subscriber = await prisma.subscriber.findUnique({
      where: { id: req.params.id },
    });

    if (!subscriber) {
      throw ApiError.notFound('Subscriber not found');
    }
  }

  const details = [
    '--- تفاصيل الاتصال ---',
    `المشترك: ${subscriber.name}`,
    `الهاتف: ${subscriber.phone}`,
    `يوزر PPPoE: ${subscriber.pppoeUsername ?? '—'}`,
    `الباقة: ${subscriber.package ?? '—'} / ${subscriber.speed ?? '—'}`,
    `الدين: ${subscriber.debt ?? 0}`,
    `حالة الاشتراك: ${subscriber.status}`,
    c ? `رقم المتصل: ${c.callerNumber ?? '—'}` : '',
    c ? `الوجهة: ${c.destinationNumber ?? '—'}` : '',
    c ? `الموظف/الامتداد: ${c.agentExtension ?? '—'}` : '',
    c ? `الخط: ${c.line ?? '—'}` : '',
    c ? `وقت الاتصال: ${c.startedAt ?? new Date().toISOString()}` : '',
    c ? `حالة الاتصال: ${c.status ?? '—'}` : '',
  ].filter(Boolean).join('\n');

  const ticket = await prisma.ticket.create({
    data: {
      subscriberId: external ? null : subscriber.id,

      externalId: external ? req.params.id : null,
      externalName: external ? subscriber.name : null,
      externalPhone: external ? subscriber.phone : null,
      externalPppoe: external ? subscriber.pppoeUsername : null,
      externalSource: external ? 'external' : null,

      agentId: req.user?.agentId ?? null,
      subject: safeSubject,
      priority: data.priority ?? 'medium',
      status: 'open',
    },
  });

  await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: details,
      authorId: req.user?.id,
    },
  });
  // ticket-push-subscriber-created
  await sendPushToEmployees(
    'تذكرة جديدة',
    `${ticket.subject || 'تذكرة جديدة'} · ${subscriber.name || subscriber.phone || 'مشترك'}`,
    `/employee/tickets?ticket=${ticket.id}`,
    {
      tag: `ticket-${ticket.id}`,
      ticketId: ticket.id,
      type: 'ticket',
    }
  ).catch(() => null);


  res.status(201).json({ ...ticket, details });
}


const ticketStatusSchema = z.object({
  status: z.enum(['open', 'pending', 'resolved', 'closed']),
});

export async function updateTicketStatus(req: Request, res: Response) {
  const data = ticketStatusSchema.parse(req.body);

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      subscriberId: req.params.id,
    },
  });

  if (!ticket) throw ApiError.notFound('Ticket not found');

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: data.status,
      agentId: ticket.agentId ?? req.user?.agentId ?? null,
    },
  });

  await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: `تم تغيير حالة التذكرة إلى: ${data.status}`,
      authorId: req.user?.id,
    },
  });

  res.json(updated);
}


const ticketCommentSchema = z.object({
  body: z.string().min(1),
});

export async function addTicketComment(req: Request, res: Response) {
  const data = ticketCommentSchema.parse(req.body);
  const isExternal = req.params.id.startsWith('ext-');

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      ...(isExternal ? { externalId: req.params.id } : { subscriberId: req.params.id }),
    },
  });

  if (!ticket) throw ApiError.notFound('Ticket not found');

  if (!ticket.agentId && req.user?.agentId) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { agentId: req.user.agentId },
    });
  }

  const note = await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: data.body,
      authorId: req.user?.id,
    },
  });

  res.status(201).json(note);
}
