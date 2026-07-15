import bcrypt from 'bcryptjs';
import { exec } from 'child_process';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

function reloadAsterisk() {
  exec('/opt/scripts/sync-callcenter-extensions.sh', (err, stdout, stderr) => {
    if (err) {
      console.error('[asterisk-sync] failed:', err.message);
      if (stderr) console.error(stderr);
      return;
    }

    if (stdout) console.log(stdout);

    exec('asterisk -rx "pjsip reload"', (e) => {
      if (e) console.error('[asterisk-sync] pjsip reload failed:', e.message);
    });

    exec('asterisk -rx "queue reload all"', (e) => {
      if (e) console.error('[asterisk-sync] queue reload failed:', e.message);
    });
  });
}

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

type AgentPerformance = {
  callsHandled: number;
  callsMissed: number;
  avgHandleTime: number;
  totalTalkTime: number;
  satisfaction: number;
  occupancy: number;
};

function serialize(a: Awaited<ReturnType<typeof fetchOne>>, performance?: AgentPerformance) {
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
    loginUsername: a.user?.username ?? a.extension?.sipUsername ?? '',
    userId: a.userId ?? null,
    workingHours: { from: a.workFrom, to: a.workTo, days: a.workDays as number[] },
    queues: a.queueMembers.map((m) => m.queueId),
    performance: performance ?? {
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

async function ensureAgentRole() {
  let role = await prisma.role.findUnique({ where: { key: 'agent' } });

  if (!role) {
    role = await prisma.role.create({
      data: {
        key: 'agent',
        name: 'موظف',
        nameEn: 'Agent',
        description: 'Call center agent',
      },
    });
  }

  const permissions = [
    { module: 'dashboard', actions: ['view'] },
    { module: 'live_calls', actions: ['view', 'edit'] },
    { module: 'subscribers', actions: ['view', 'edit'] },
    { module: 'call_logs', actions: ['view'] },
    { module: 'recordings', actions: ['view'] },
  ];

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { roleId_module: { roleId: role.id, module: p.module } },
      update: { actions: p.actions },
      create: { roleId: role.id, module: p.module, actions: p.actions },
    });
  }

  return role;
}

async function uniqueUsername(base: string) {
  const clean = (base || 'agent').trim().replace(/\s+/g, '_');
  let username = clean;
  let i = 1;

  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${clean}_${i++}`;
  }

  return username;
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
    include: { extension: true, department: true, queueMembers: true, user: true },
  });
}

export async function list(_req: Request, res: Response) {
  const rows = await prisma.agent.findMany({
    include: { extension: true, department: true, queueMembers: true, user: true },
    orderBy: { createdAt: 'asc' },
  });

  const agentIds = rows.map((a) => a.id);
  const extensions = rows.map((a) => a.extension?.number).filter(Boolean) as string[];
  const extToAgent = new Map(rows.filter((a) => a.extension?.number).map((a) => [a.extension!.number, a.id]));

  const calls = await prisma.call.findMany({
    where: {
      OR: [
        { agentId: { in: agentIds } },
        { callerNumber: { in: extensions } },
        { destinationNumber: { in: extensions } },
      ],
    },
    select: {
      agentId: true,
      callerNumber: true,
      destinationNumber: true,
      status: true,
      disposition: true,
      durationSec: true,
      startedAt: true,
    },
  });

  const perf = new Map<string, AgentPerformance>();

  for (const a of rows) {
    perf.set(a.id, {
      callsHandled: 0,
      callsMissed: 0,
      avgHandleTime: 0,
      totalTalkTime: 0,
      satisfaction: 100,
      occupancy: 0,
    });
  }

  for (const c of calls) {
    const agentId =
      c.agentId ||
      extToAgent.get(c.destinationNumber) ||
      extToAgent.get(c.callerNumber);

    if (!agentId || !perf.has(agentId)) continue;

    const p = perf.get(agentId)!;
    const disposition = String(c.disposition || '').toLowerCase();
    const status = String(c.status || '').toLowerCase();
    const duration = Number(c.durationSec || 0) || 0;

    const answered =
      disposition === 'answered' ||
      status === 'ended' ||
      status === 'active' ||
      duration > 0;

    const missed =
      disposition === 'missed' ||
      disposition === 'no_answer' ||
      disposition === 'abandoned' ||
      disposition === 'busy' ||
      status === 'missed' ||
      status === 'failed';

    if (answered) {
      p.callsHandled += 1;
      p.totalTalkTime += duration;
    } else if (missed) {
      p.callsMissed += 1;
    }
  }

  for (const p of perf.values()) {
    p.avgHandleTime = p.callsHandled ? Math.round(p.totalTalkTime / p.callsHandled) : 0;
    const total = p.callsHandled + p.callsMissed;
    p.satisfaction = total ? Math.round((p.callsHandled / total) * 100) : 0;
    p.occupancy = Math.min(100, Math.round((p.totalTalkTime / (8 * 60 * 60)) * 100));
  }

  res.json(rows.map((a) => serialize(a, perf.get(a.id))));
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const departmentId = await validDepartmentId(data.departmentId);
  const queueIds = await validQueueIds(data.queueIds);

  const role = await ensureAgentRole();
  const username = await uniqueUsername(data.sipUsername || data.extension || data.name);
  const rawPassword = data.sipPassword || data.extension || '12345678';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email: data.email || null,
      fullName: data.name,
      passwordHash,
      roleId: role.id,
      active: true,
    },
  });

  const agent = await prisma.agent.create({
    data: {
      name: data.name,
      email: data.email || null,
      status: data.status ?? 'offline',
      departmentId,
      userId: user.id,
      workFrom: data.workFrom ?? '09:00',
      workTo: data.workTo ?? '17:00',
      workDays: data.workDays ?? [0, 1, 2, 3, 4],
      queueMembers: queueIds.length ? { create: queueIds.map((queueId) => ({ queueId })) } : undefined,
    },
    include: { extension: true, department: true, queueMembers: true, user: true },
  });

  if (data.extension) {
    const sipUser = data.sipUsername ?? data.extension;

    const existingExtension = await prisma.extension.findFirst({
      where: {
        OR: [
          { number: data.extension },
          { sipUsername: sipUser },
        ],
      },
    });

    if (existingExtension) {
      if (existingExtension.agentId) {
        throw ApiError.badRequest(`Extension ${data.extension} is already assigned`);
      }

      await prisma.extension.update({
        where: { id: existingExtension.id },
        data: {
          agentId: agent.id,
          number: data.extension,
          sipUsername: sipUser,
          sipPassword: rawPassword,
        },
      });
    } else {
      await prisma.extension.create({
        data: {
          agentId: agent.id,
          number: data.extension,
          sipUsername: sipUser,
          sipPassword: rawPassword,
        },
      });
    }
  }

  reloadAsterisk();

  res.status(201).json({
    ...serialize(agent),
    loginUsername: username,
    loginPassword: rawPassword,
  });
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const departmentId = data.departmentId === undefined ? undefined : await validDepartmentId(data.departmentId);
  const queueIds = data.queueIds === undefined ? undefined : await validQueueIds(data.queueIds);
  const existing = await fetchOne(req.params.id);
  if (!existing) throw ApiError.notFound('Agent not found');

  const updatedAgent = await prisma.agent.update({
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
    include: { user: true },
  });

  if (updatedAgent.userId) {
    const userPatch: any = {};
    if (data.name) userPatch.fullName = data.name;
    if (data.email !== undefined) userPatch.email = data.email || null;
    if (data.sipUsername) userPatch.username = data.sipUsername;
    if (data.sipPassword) userPatch.passwordHash = await bcrypt.hash(data.sipPassword, 10);

    if (Object.keys(userPatch).length) {
      await prisma.user.update({
        where: { id: updatedAgent.userId },
        data: userPatch,
      });
    }
  }

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

  reloadAsterisk();

  res.json(serialize(await fetchOne(req.params.id)));
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Agent not found');
  await prisma.agent.delete({ where: { id: req.params.id } });

  reloadAsterisk();

  res.status(204).end();
}
