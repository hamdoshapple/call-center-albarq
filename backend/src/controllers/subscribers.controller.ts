import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

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
  const row = await prisma.subscriber.findUnique({
    where: { id: req.params.id },
    include: { tickets: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw ApiError.notFound('Subscriber not found');
  res.json(row);
}

export async function getTickets(req: Request, res: Response) {
  const rows = await prisma.ticket.findMany({ where: { subscriberId: req.params.id }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
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
