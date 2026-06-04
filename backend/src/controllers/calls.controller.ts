import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { getAsteriskGateway } from '../asterisk/index.js';

export async function listLogs(req: Request, res: Response) {
  const { search, direction, disposition, agentId, queueId, from, to } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25)));

  const where = {
    OR: search ? [{ callerNumber: { contains: search } }, { destinationNumber: { contains: search } }] : undefined,
    direction: direction || undefined,
    disposition: disposition || undefined,
    agentId: agentId || undefined,
    queueId: queueId || undefined,
    startedAt:
      from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.findMany({
      where,
      include: { agent: { select: { id: true, name: true } }, queue: { select: { id: true, name: true } }, recording: { select: { id: true } } },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ total, page, pageSize, rows });
}

export async function getLive(_req: Request, res: Response) {
  const gw = getAsteriskGateway();
  const calls = await gw.getLiveCalls();

  const normalizePhone = (v: string) => {
    const digits = String(v || '').replace(/\D/g, '');
    if (digits.startsWith('964')) return `0${digits.slice(3)}`;
    return digits;
  };

  const phones = [...new Set(calls.map((c) => normalizePhone(c.callerNumber)).filter(Boolean))];

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
        select: { id: true, name: true, phone: true },
      })
    : [];

  console.log('[LIVE SUB LOOKUP]', {
    callPhones: calls.map((c) => c.callerNumber),
    normalizedPhones: phones,
    variants,
    subscribersFound: subscribers,
  });

  const subByPhone = new Map(subscribers.map((s) => [normalizePhone(s.phone), s]));

  res.json(
    calls.map((c) => {
      const sub = subByPhone.get(normalizePhone(c.callerNumber));
      return {
        id: c.uniqueId,
        callerNumber: c.callerNumber,
        callerName: sub?.name ?? null,
        subscriberId: sub?.id ?? null,
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
  const call = await prisma.call.findUnique({ where: { id: req.params.id } });
  if (!call) throw ApiError.notFound('Call not found');
  await prisma.call.update({ where: { id: req.params.id }, data: { note } });
  await prisma.callEvent.create({ data: { callId: call.id, type: 'note', detail: note, actor: req.user?.username } });
  res.json({ success: true });
}
