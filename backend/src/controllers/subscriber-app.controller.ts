import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

export async function getConfig(_req: Request, res: Response) {
  let cfg = await prisma.subscriberAppConfig.findFirst();
  if (!cfg) cfg = await prisma.subscriberAppConfig.create({ data: {} });
  res.json(cfg);
}

export async function updateConfig(req: Request, res: Response) {
  let cfg = await prisma.subscriberAppConfig.findFirst();
  if (!cfg) cfg = await prisma.subscriberAppConfig.create({ data: {} });

  const updated = await prisma.subscriberAppConfig.update({
    where: { id: cfg.id },
    data: req.body,
  });

  res.json(updated);
}

export async function listBanners(_req: Request, res: Response) {
  const rows = await prisma.subscriberAppBanner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(rows);
}

export async function createBanner(req: Request, res: Response) {
  const row = await prisma.subscriberAppBanner.create({ data: req.body });
  res.json(row);
}

export async function deleteBanner(req: Request, res: Response) {
  await prisma.subscriberAppBanner.delete({ where: { id: req.params.id } });
  res.json({ success: true });
}
