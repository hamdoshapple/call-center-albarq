import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  name: z.string().min(1),
  number: z.string().min(1),
  strategy: z.enum(['ringall', 'linear', 'leastrecent', 'roundrobin']).optional(),
  maxWaitTime: z.number().optional(),
  musicOnHold: z.string().optional(),
  announcement: z.string().optional(),
  missedBehavior: z.enum(['voicemail', 'callback', 'overflow', 'hangup']).optional(),
  departmentId: z.string().nullish(),
  agentIds: z.array(z.string()).optional(),
});

function serialize(q: {
  id: string; name: string; number: string; strategy: string; maxWaitTime: number;
  musicOnHold: string; announcement: string | null; missedBehavior: string; departmentId: string | null;
  waiting: number; answered: number; abandoned: number; avgWait: number; serviceLevel: number;
  members: { agentId: string }[];
}) {
  return {
    id: q.id, name: q.name, number: q.number, strategy: q.strategy, maxWaitTime: q.maxWaitTime,
    musicOnHold: q.musicOnHold, announcement: q.announcement ?? '', missedBehavior: q.missedBehavior,
    departmentId: q.departmentId ?? undefined,
    agentIds: q.members.map((m) => m.agentId),
    stats: { waiting: q.waiting, answered: q.answered, abandoned: q.abandoned, avgWait: q.avgWait, serviceLevel: q.serviceLevel },
  };
}

export async function list(_req: Request, res: Response) {
  const rows = await prisma.queue.findMany({
    include: { members: true },
    orderBy: { createdAt: 'desc' },
  });

  const seen = new Set<string>();
  const unique = [];

  for (const row of rows) {
    const key = row.number || row.name;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  res.json(unique.reverse().map(serialize));
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.queue.create({
    data: {
      name: data.name, number: data.number, strategy: data.strategy ?? 'ringall',
      maxWaitTime: data.maxWaitTime ?? 120, musicOnHold: data.musicOnHold ?? 'default',
      announcement: data.announcement, missedBehavior: data.missedBehavior ?? 'voicemail',
      departmentId: data.departmentId ?? null,
      members: data.agentIds ? { create: data.agentIds.map((agentId) => ({ agentId })) } : undefined,
    },
    include: { members: true },
  });
  res.status(201).json(serialize(row));
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.queue.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Queue not found');

  await prisma.queue.update({
    where: { id: req.params.id },
    data: {
      name: data.name, number: data.number, strategy: data.strategy, maxWaitTime: data.maxWaitTime,
      musicOnHold: data.musicOnHold, announcement: data.announcement, missedBehavior: data.missedBehavior,
      departmentId: data.departmentId === undefined ? undefined : data.departmentId,
    },
  });

  if (data.agentIds) {
    await prisma.queueMember.deleteMany({ where: { queueId: req.params.id } });
    await prisma.queueMember.createMany({ data: data.agentIds.map((agentId) => ({ agentId, queueId: req.params.id })) });
  }

  const row = await prisma.queue.findUnique({ where: { id: req.params.id }, include: { members: true } });
  res.json(serialize(row!));
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.queue.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Queue not found');
  await prisma.queue.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
