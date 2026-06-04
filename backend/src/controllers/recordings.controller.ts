import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

export async function list(req: Request, res: Response) {
  const { search, agentId, from } = req.query as Record<string, string | undefined>;
  const rows = await prisma.recording.findMany({
    where: {
      callerNumber: search ? { contains: search } : undefined,
      agentId: agentId || undefined,
      recordedAt: from ? { gte: new Date(from) } : undefined,
    },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { recordedAt: 'desc' },
    take: 200,
  });
  res.json(rows);
}

export async function getOne(req: Request, res: Response) {
  const row = await prisma.recording.findUnique({
    where: { id: req.params.id },
    include: { agent: { select: { id: true, name: true } }, call: true },
  });
  if (!row) throw ApiError.notFound('Recording not found');
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.recording.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Recording not found');
  await prisma.recording.delete({ where: { id: req.params.id } });
  res.status(204).end();
}


export async function streamAudio(req: Request, res: Response) {
  const row = await prisma.recording.findUnique({ where: { id: req.params.id } });
  if (!row) throw ApiError.notFound('Recording not found');

  if (row.url && row.url !== '#' && /^https?:\/\//i.test(row.url)) {
    return res.redirect(row.url);
  }

  const setting = await prisma.setting.findUnique({ where: { key: 'asterisk' } });
  const recordingPath =
    ((setting?.value as any)?.recordingPath as string | undefined) ||
    '/var/spool/asterisk/monitor';

  const safeName = path.basename(row.fileName);
  const filePath = path.join(recordingPath, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording file not found on server', fileName: safeName });
  }

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  fs.createReadStream(filePath).pipe(res);
}
