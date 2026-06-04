import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const optionSchema = z.object({
  key: z.string().min(1),
  label: z.string().default(''),
  destinationType: z.enum(['queue', 'department', 'agent', 'ivr', 'hangup', 'voicemail', 'external']),
  destinationId: z.string().optional(),
  destinationValue: z.string().optional(),
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  greetingPromptId: z.string().nullish(),
  timeout: z.number().optional(),
  timeoutDestination: z.string().optional(),
  invalidDestination: z.string().optional(),
  repeatOnInvalid: z.boolean().optional(),
  maxRepeats: z.number().optional(),
  active: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
});

export async function list(_req: Request, res: Response) {
  const rows = await prisma.ivrMenu.findMany({ include: { options: true }, orderBy: { createdAt: 'asc' } });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.ivrMenu.create({
    data: {
      name: data.name, description: data.description, greetingPromptId: data.greetingPromptId ?? null,
      timeout: data.timeout ?? 10, timeoutDestination: data.timeoutDestination ?? 'hangup',
      invalidDestination: data.invalidDestination ?? 'repeat', repeatOnInvalid: data.repeatOnInvalid ?? true,
      maxRepeats: data.maxRepeats ?? 3, active: data.active ?? true,
      options: data.options ? { create: data.options } : undefined,
    },
    include: { options: true },
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.ivrMenu.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('IVR menu not found');

  await prisma.ivrMenu.update({
    where: { id: req.params.id },
    data: {
      name: data.name, description: data.description,
      greetingPromptId: data.greetingPromptId === undefined ? undefined : data.greetingPromptId,
      timeout: data.timeout, timeoutDestination: data.timeoutDestination,
      invalidDestination: data.invalidDestination, repeatOnInvalid: data.repeatOnInvalid,
      maxRepeats: data.maxRepeats, active: data.active,
    },
  });

  if (data.options) {
    await prisma.ivrOption.deleteMany({ where: { menuId: req.params.id } });
    await prisma.ivrOption.createMany({ data: data.options.map((o) => ({ ...o, menuId: req.params.id })) });
  }

  const row = await prisma.ivrMenu.findUnique({ where: { id: req.params.id }, include: { options: true } });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.ivrMenu.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('IVR menu not found');
  await prisma.ivrMenu.delete({ where: { id: req.params.id } });
  res.status(204).end();
}
