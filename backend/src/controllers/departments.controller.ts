import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  name: z.string().min(1),
  nameEn: z.string().min(1),
  description: z.string().optional().default(''),
  color: z.string().optional().default('#0ea5e9'),
});

export async function list(_req: Request, res: Response) {
  const rows = await prisma.department.findMany({
    include: { agents: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.department.create({ data });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const row = await prisma.department.update({ where: { id: req.params.id }, data });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const exists = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!exists) throw ApiError.notFound('Department not found');
  await prisma.department.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
