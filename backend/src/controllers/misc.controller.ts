import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

// ---------- Dashboard ----------
export async function dashboardStats(_req: Request, res: Response) {
  const [answered, missed, agents, queues, live] = await Promise.all([
    prisma.call.count({ where: { disposition: 'answered' } }),
    prisma.call.count({ where: { disposition: { in: ['missed', 'no_answer', 'abandoned'] } } }),
    prisma.agent.findMany({ select: { status: true } }),
    prisma.queue.findMany({ select: { avgWait: true, serviceLevel: true } }),
    prisma.call.findMany({ where: { status: { in: ['ringing', 'waiting', 'active'] } }, select: { status: true, talkTimeSec: true } }),
  ]);

  const onlineAgents = agents.filter((a) => a.status === 'online').length;
  const busyAgents = agents.filter((a) => a.status === 'busy').length;
  const avgWait = queues.length ? Math.round(queues.reduce((s, q) => s + q.avgWait, 0) / queues.length) : 0;
  const serviceLevel = queues.length ? Math.round(queues.reduce((s, q) => s + q.serviceLevel, 0) / queues.length) : 0;
  const talk = await prisma.call.aggregate({ _avg: { talkTimeSec: true }, where: { disposition: 'answered' } });

  res.json({
    callsToday: answered + missed,
    activeCalls: live.filter((c) => c.status === 'active').length,
    answeredCalls: answered,
    missedCalls: missed,
    waitingCalls: live.filter((c) => c.status === 'waiting' || c.status === 'ringing').length,
    onlineAgents,
    busyAgents,
    avgWaitTime: avgWait,
    avgCallDuration: Math.round(talk._avg.talkTimeSec ?? 0),
    serviceLevel,
    answerRate: Math.round((answered / Math.max(1, answered + missed)) * 100),
  });
}

// ---------- Permissions ----------
export async function getPermissions(_req: Request, res: Response) {
  const roles = await prisma.role.findMany({ include: { permissions: true } });
  const out: Record<string, Record<string, string[]>> = {};
  for (const r of roles) {
    out[r.key] = {};
    for (const p of r.permissions) out[r.key][p.module] = (p.actions as string[]) ?? [];
  }
  res.json(out);
}

export async function setPermission(req: Request, res: Response) {
  const { role, module, actions } = req.body as { role: string; module: string; actions: string[] };
  const roleRow = await prisma.role.findUnique({ where: { key: role } });
  if (!roleRow) return res.status(404).json({ error: 'Role not found' });
  await prisma.permission.upsert({
    where: { roleId_module: { roleId: roleRow.id, module } },
    update: { actions },
    create: { roleId: roleRow.id, module, actions },
  });
  res.json({ success: true });
}

// ---------- Company settings ----------
const COMPANY_KEY = 'company';
const COMPANY_DEFAULT = {
  name: 'مركز اتصال البرق', nameEn: 'Call Center Albarq', logo: '/logo.svg', themeColor: '#0ea5e9',
  language: 'ar', businessHours: { from: '08:00', to: '20:00', days: [0, 1, 2, 3, 4, 5] },
  closedMessage: 'مركز الاتصال مغلق حالياً. يرجى الاتصال خلال ساعات العمل.', holidays: [],
};

export async function getCompany(_req: Request, res: Response) {
  const row = await prisma.setting.findUnique({ where: { key: COMPANY_KEY } });
  res.json(row?.value ?? COMPANY_DEFAULT);
}

export async function updateCompany(req: Request, res: Response) {
  const current = (await prisma.setting.findUnique({ where: { key: COMPANY_KEY } }))?.value ?? COMPANY_DEFAULT;
  const merged = { ...(current as object), ...req.body };
  const row = await prisma.setting.upsert({
    where: { key: COMPANY_KEY },
    update: { value: merged },
    create: { key: COMPANY_KEY, value: merged },
  });
  res.json(row.value);
}

// ---------- Notifications ----------
export async function listNotifications(_req: Request, res: Response) {
  const rows = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(rows);
}

export async function markNotificationRead(req: Request, res: Response) {
  await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  res.json({ success: true });
}

// ---------- Transfers & Callbacks (read) ----------
export async function listTransfers(_req: Request, res: Response) {
  const rows = await prisma.callEvent.findMany({
    where: { type: 'transfer' },
    include: {
      call: {
        select: {
          id: true,
          callerNumber: true,
          destinationNumber: true,
          agentId: true,
          startedAt: true,
        },
      },
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
  res.json(rows);
}

export async function listCallbacks(_req: Request, res: Response) {
  const rows = await prisma.callback.findMany({ orderBy: { scheduledFor: 'desc' } });
  res.json(rows);
}
