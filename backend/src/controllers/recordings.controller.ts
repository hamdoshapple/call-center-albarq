import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

async function recordingBasePath() {
  const setting = await prisma.setting.findUnique({ where: { key: 'asterisk' } });
  return ((setting?.value as any)?.recordingPath as string | undefined) || '/var/spool/asterisk/monitor';
}

function parseRecordingFile(fileName: string) {
  const base = path.basename(fileName, '.wav');
  const parts = base.split('-');

  if (base.startsWith('test-ar-') || base.startsWith('test-')) {
    return { callerNumber: 'test-rec', destinationNumber: 'test-rec', uniqueId: base, direction: 'internal' };
  }

  return {
    callerNumber: parts[2] || 'unknown',
    destinationNumber: parts[3] || 'unknown',
    uniqueId: parts.slice(4).join('-') || base,
    direction: 'inbound',
  };
}

function estimateWavDurationSec(size: number) {
  return Math.max(1, Math.round(Math.max(0, size - 44) / 16000));
}

async function syncRecordingsFromDisk() {
  const basePath = await recordingBasePath();
  if (!fs.existsSync(basePath)) return;

  const files = fs.readdirSync(basePath).filter((f) => f.toLowerCase().endsWith('.wav'));

  for (const fileName of files) {
    const filePath = path.join(basePath, path.basename(fileName));
    const stat = fs.statSync(filePath);

    if (stat.size <= 44) continue;

    const exists = await prisma.recording.findFirst({ where: { fileName } });
    if (exists) continue;

    const parsed = parseRecordingFile(fileName);

    const ext = await prisma.extension.findUnique({
      where: { number: parsed.destinationNumber },
      include: { agent: true },
    });

    const duration = estimateWavDurationSec(stat.size);

    const call = await prisma.call.create({
      data: {
        uniqueId: parsed.uniqueId,
        callerNumber: parsed.callerNumber,
        destinationNumber: parsed.destinationNumber,
        direction: parsed.direction,
        status: 'ended',
        disposition: 'answered',
        agentId: ext?.agent?.id ?? null,
        startedAt: stat.birthtime,
        endedAt: stat.mtime,
        durationSec: duration,
        talkTimeSec: duration,
        waitTimeSec: 0,
      },
    });

    await prisma.recording.create({
      data: {
        callId: call.id,
        callerNumber: parsed.callerNumber,
        agentId: ext?.agent?.id ?? null,
        fileName,
        url: `/api/recordings/${call.id}/audio`,
        durationSec: duration,
        sizeKb: Math.max(1, Math.round(stat.size / 1024)),
        recordedAt: stat.birthtime,
      },
    });
  }
}

export async function list(req: Request, res: Response) {
  await syncRecordingsFromDisk();

  const { search, agentId, from, to, includeMissing } = req.query as Record<string, string | undefined>;
  const basePath = await recordingBasePath();

  const rows = await prisma.recording.findMany({
    where: {
      callerNumber: search ? { contains: search } : undefined,
      agentId: req.user?.role === 'agent' ? req.user.agentId : (agentId || undefined),
      recordedAt:
        from || to
          ? {
              gte: from ? new Date(from) : undefined,
              lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
            }
          : undefined,
    },
    include: { agent: { select: { id: true, name: true } } },
    orderBy: { recordedAt: 'desc' },
    take: 200,
  });

  const mapped = rows.map((r) => {
    const safeName = path.basename(r.fileName);
    const exists = fs.existsSync(path.join(basePath, safeName));
    return { ...r, fileExists: exists, url: exists ? `/api/recordings/${r.id}/audio` : null };
  });

  res.json(includeMissing === '1' ? mapped : mapped.filter((r) => r.fileExists));
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

  const recordingPath = await recordingBasePath();
  const safeName = path.basename(row.fileName);
  const filePath = path.join(recordingPath, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording file not found on server', fileName: safeName });
  }

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  fs.createReadStream(filePath).pipe(res);
}
