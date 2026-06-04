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
  // Live calls come from the Asterisk gateway (mock simulator in demo mode),
  // not the CDR table. The same data also streams over Socket.IO.
  const gw = getAsteriskGateway();
  const calls = await gw.getLiveCalls();
  res.json(
    calls.map((c) => ({
      id: c.uniqueId,
      callerNumber: c.callerNumber,
      destinationNumber: c.destinationNumber,
      direction: c.direction,
      status: c.status,
      agentExtension: c.agentExtension ?? null,
      queue: c.queue ?? null,
      line: c.line ?? null,
      startedAt: c.startedAt,
      durationSec: c.durationSec,
    }))
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
