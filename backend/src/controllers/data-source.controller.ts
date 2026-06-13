import type { Request, Response } from 'express';
import { z } from 'zod';
import { cacheStats, refreshSubscriberCache, updateCacheSetting } from '../services/subscriber-cache.service.js';

export async function status(_req: Request, res: Response) {
  res.json(await cacheStats());
}

export async function refresh(req: Request, res: Response) {
  const q = String(req.body?.q || req.query?.q || '');
  const count = await refreshSubscriberCache(q);
  res.json({ success: true, count });
}

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  cacheTtlMinutes: z.number().int().min(1).max(10080).optional(),
  fallbackToCache: z.boolean().optional(),
  manualCacheOnly: z.boolean().optional(),
});

export async function update(req: Request, res: Response) {
  const data = settingsSchema.parse(req.body);
  res.json(await updateCacheSetting(data));
}
