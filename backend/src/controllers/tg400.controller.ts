import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  slot: z.number(),
  number: z.string().min(1),
  carrier: z.string().optional(),
  status: z.enum(['active', 'inactive', 'no_sim', 'error']).optional(),
  signal: z.number().min(0).max(100).optional(),
  purpose: z.string().optional(),
  inboundRoute: z.string().optional(),
  outboundRoute: z.string().optional(),
  balance: z.number().optional(),
});

function serialize(l: {
  id: string; slot: number; number: string; carrier: string | null; status: string; signal: number;
  purpose: string | null; inboundRoute: string; outboundRoute: string; balance: number;
  usageCalls: number; usageMinutes: number; usageCost: number;
}) {
  return {
    id: l.id, slot: l.slot, number: l.number, carrier: l.carrier ?? '', status: l.status, signal: l.signal,
    purpose: l.purpose ?? '', inboundRoute: l.inboundRoute, outboundRoute: l.outboundRoute, balance: l.balance,
    usage: { calls: l.usageCalls, minutes: l.usageMinutes, cost: l.usageCost },
  };
}

export async function list(_req: Request, res: Response) {
  const rows = await prisma.tg400Line.findMany({ orderBy: { slot: 'asc' } });
  res.json(rows.map(serialize));
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.tg400Line.create({
    data: {
      slot: data.slot, number: data.number, carrier: data.carrier, status: data.status ?? 'no_sim',
      signal: data.signal ?? 0, purpose: data.purpose, inboundRoute: data.inboundRoute ?? '-',
      outboundRoute: data.outboundRoute ?? '-', balance: data.balance ?? 0,
    },
  });
  res.status(201).json(serialize(row));
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.tg400Line.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Line not found');
  const row = await prisma.tg400Line.update({ where: { id: req.params.id }, data });
  res.json(serialize(row));
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.tg400Line.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Line not found');
  await prisma.tg400Line.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
