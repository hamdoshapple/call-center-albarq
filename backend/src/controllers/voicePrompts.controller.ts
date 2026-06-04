import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  name: z.string().min(1),
  category: z.enum(['welcome', 'waiting', 'closed_hours', 'busy', 'ivr', 'announcement', 'other']),
  fileName: z.string().min(1),
  url: z.string().default('#'),
  duration: z.number().optional(),
  language: z.string().optional(),
  sizeKb: z.number().optional(),
});

export async function list(_req: Request, res: Response) {
  const rows = await prisma.voicePrompt.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.voicePrompt.create({
    data: { ...data, duration: data.duration ?? 0, language: data.language ?? 'ar', sizeKb: data.sizeKb ?? 0 },
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Voice prompt not found');
  const row = await prisma.voicePrompt.update({ where: { id: req.params.id }, data });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Voice prompt not found');
  await prisma.voicePrompt.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
