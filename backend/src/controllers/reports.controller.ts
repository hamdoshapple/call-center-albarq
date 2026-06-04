import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

export async function agentPerformance(_req: Request, res: Response) {
  const agents = await prisma.agent.findMany({ include: { extension: true }, orderBy: { callsHandled: 'desc' } });
  res.json(
    agents.map((a) => ({
      agentId: a.id, name: a.name, extension: a.extension?.number ?? '',
      callsHandled: a.callsHandled, callsMissed: a.callsMissed, avgHandleTime: a.avgHandleTime,
      satisfaction: a.satisfaction, occupancy: a.occupancy,
    }))
  );
}

export async function queuePerformance(_req: Request, res: Response) {
  const queues = await prisma.queue.findMany({ orderBy: { answered: 'desc' } });
  res.json(
    queues.map((q) => ({
      queueId: q.id, name: q.name, number: q.number,
      answered: q.answered, abandoned: q.abandoned, avgWait: q.avgWait, serviceLevel: q.serviceLevel,
    }))
  );
}

export async function peakHours(_req: Request, res: Response) {
  const calls = await prisma.call.findMany({ select: { startedAt: true } });
  const buckets = new Map<number, number>();
  for (const c of calls) {
    const h = new Date(c.startedAt).getHours();
    buckets.set(h, (buckets.get(h) ?? 0) + 1);
  }
  const out = [];
  for (let h = 8; h <= 18; h++) out.push({ label: `${String(h).padStart(2, '0')}:00`, calls: buckets.get(h) ?? 0 });
  res.json(out);
}

export async function missedCalls(_req: Request, res: Response) {
  const rows = await prisma.call.findMany({
    where: { disposition: { in: ['missed', 'no_answer', 'abandoned'] } },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  res.json(rows);
}

export async function callbacks(_req: Request, res: Response) {
  const rows = await prisma.callback.findMany({
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { scheduledFor: 'desc' },
  });
  res.json(rows);
}
