import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['online', 'offline', 'busy', 'paused']).optional(),
  departmentId: z.string().nullish(),
  extension: z.string().optional(),
  sipUsername: z.string().optional(),
  sipPassword: z.string().optional(),
  workFrom: z.string().optional(),
  workTo: z.string().optional(),
  workDays: z.array(z.number()).optional(),
  queueIds: z.array(z.string()).optional(),
});

function serialize(a: Awaited<ReturnType<typeof fetchOne>>) {
  if (!a) return a;
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    status: a.status,
    departmentId: a.departmentId,
    department: a.department,
    extension: a.extension?.number ?? '',
    sipUsername: a.extension?.sipUsername ?? '',
    sipPassword: a.extension?.sipPassword ?? '',
    workingHours: { from: a.workFrom, to: a.workTo, days: a.workDays as number[] },
    queues: a.queueMembers.map((m) => m.queueId),
    performance: {
      callsHandled: a.callsHandled,
      callsMissed: a.callsMissed,
      avgHandleTime: a.avgHandleTime,
      totalTalkTime: a.totalTalkTime,
      satisfaction: a.satisfaction,
      occupancy: a.occupancy,
    },
    createdAt: a.createdAt,
  };
}

async function validDepartmentId(id?: string | null) {
  if (!id) return null;
  const row = await prisma.department.findUnique({ where: { id } });
  return row ? id : null;
}

async function validQueueIds(ids?: string[]) {
  if (!ids?.length) return [];
  const rows = await prisma.queue.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return rows.map((x) => x.id);
}

function fetchOne(id: string) {
  return prisma.agent.findUnique({
    where: { id },
    include: { extension: true, department: true, queueMembers: true },
  });
}

export async function list(_req: Request, res: Response) {
  const rows = await prisma.agent.findMany({
    include: { extension: true, department: true, queueMembers: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rows.map(serialize));
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const departmentId = await validDepartmentId(data.departmentId);
  const queueIds = await validQueueIds(data.queueIds);
  const agent = await prisma.agent.create({
    data: {
      name: data.name,
      email: data.email || null,
      status: data.status ?? 'offline',
      departmentId,
      workFrom: data.workFrom ?? '09:00',
      workTo: data.workTo ?? '17:00',
      workDays: data.workDays ?? [0, 1, 2, 3, 4],
      extension: data.extension
        ? { create: { number: data.extension, sipUsername: data.sipUsername ?? data.extension, sipPassword: data.sipPassword ?? '' } }
        : undefined,
      queueMembers: queueIds.length ? { create: queueIds.map((queueId) => ({ queueId })) } : undefined,
    },
    include: { extension: true, department: true, queueMembers: true },
  });
  res.status(201).json(serialize(agent));
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const departmentId = data.departmentId === undefined ? undefined : await validDepartmentId(data.departmentId);
  const queueIds = data.queueIds === undefined ? undefined : await validQueueIds(data.queueIds);
  const existing = await fetchOne(req.params.id);
  if (!existing) throw ApiError.notFound('Agent not found');

  await prisma.agent.update({
    where: { id: req.params.id },
    data: {
      name: data.name,
      email: data.email,
      status: data.status,
      departmentId,
      workFrom: data.workFrom,
      workTo: data.workTo,
      workDays: data.workDays,
    },
  });

  if (data.extension || data.sipUsername || data.sipPassword) {
    await prisma.extension.upsert({
      where: { agentId: req.params.id },
      update: { number: data.extension, sipUsername: data.sipUsername, sipPassword: data.sipPassword },
      create: {
        agentId: req.params.id,
        number: data.extension ?? '0000',
        sipUsername: data.sipUsername ?? data.extension ?? 'sip',
        sipPassword: data.sipPassword ?? '',
      },
    });
  }

  if (queueIds !== undefined) {
    await prisma.queueMember.deleteMany({ where: { agentId: req.params.id } });
    if (queueIds.length) {
      await prisma.queueMember.createMany({
        data: queueIds.map((queueId) => ({ queueId, agentId: req.params.id })),
      });
    }
  }

  res.json(serialize(await fetchOne(req.params.id)));
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Agent not found');
  await prisma.agent.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
