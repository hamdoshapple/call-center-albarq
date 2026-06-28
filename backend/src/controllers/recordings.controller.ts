import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { searchSubscriberCache } from '../services/subscriber-cache.service.js';

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

  // Format examples:
  // 20260628-015216-102-9900046850780339-1782600736.1264.wav
  // 20260627-235406-in-20001-7000-1782593646.1213.wav
  const p2 = parts[2] || '';
  const p3 = parts[3] || '';
  const p4 = parts[4] || '';

  if (['in', 'out', 'internal'].includes(p2)) {
    return {
      callerNumber: p4 || p3 || 'unknown',
      destinationNumber: p3 || 'unknown',
      uniqueId: parts.slice(5).join('-') || base,
      direction: p2 === 'out' ? 'outbound' : p2 === 'internal' ? 'internal' : 'inbound',
    };
  }

  return {
    callerNumber: p3 || 'unknown',
    destinationNumber: p2 || 'unknown',
    uniqueId: parts.slice(4).join('-') || base,
    direction: 'inbound',
  };
}

function estimateWavDurationSec(size: number) {
  return Math.max(1, Math.round(Math.max(0, size - 44) / 16000));
}

function normalizePhone(v?: string | null) {
  let n = String(v || '').replace(/\D/g, '');

  if (n.startsWith('00964')) n = n.slice(5);
  else if (n.startsWith('964')) n = n.slice(3);

  if (n.startsWith('0')) n = n.slice(1);

  return n;
}

async function findSubscriberByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 10) return null;

  // التسجيلات تعتمد على الكاش فقط حتى لا نضغط على لايف MSSQL
  const cachedRows = await searchSubscriberCache(normalized);
  const exactCached = cachedRows.find((x: any) => {
    const p = normalizePhone(x.phone);
    const u = normalizePhone(x.pppoeUsername);
    return (
      (p.length >= 10 && p === normalized) ||
      (u.length >= 10 && u === normalized)
    );
  });

  if (exactCached) return exactCached as any;

  const rows = await prisma.subscriber.findMany({
    where: {
      OR: [
        { phone: { contains: normalized } },
        { pppoeUsername: { contains: normalized } },
      ],
    },
    select: { id: true, name: true, phone: true, pppoeUsername: true },
    take: 50,
  });

  return rows.find((x) => {
    const p = normalizePhone(x.phone);
    const u = normalizePhone(x.pppoeUsername);
    return (
      (p.length >= 10 && p === normalized) ||
      (u.length >= 10 && u === normalized)
    );
  }) || null;
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

    const liveCall = await prisma.call.findUnique({ where: { uniqueId: parsed.uniqueId } });
    if (liveCall && parsed.callerNumber === '7000') {
      parsed.callerNumber = liveCall.callerNumber || parsed.callerNumber;
      parsed.destinationNumber = liveCall.destinationNumber || parsed.destinationNumber;
      parsed.direction = liveCall.direction || parsed.direction;
    }

    const ext = await prisma.extension.findUnique({
      where: { number: parsed.destinationNumber },
      include: { agent: true },
    });

    const subscriber = await findSubscriberByPhone(parsed.callerNumber);
    const duration = estimateWavDurationSec(stat.size);

    const call = await prisma.call.upsert({
      where: { uniqueId: parsed.uniqueId },
      update: {
        callerNumber: parsed.callerNumber,
        destinationNumber: parsed.destinationNumber,
        direction: parsed.direction,
        status: 'ended',
        disposition: 'answered',
        agentId: ext?.agent?.id ?? null,
        subscriberId: subscriber?.id ?? null,
        endedAt: stat.mtime,
        durationSec: duration,
        talkTimeSec: duration,
        waitTimeSec: 0,
      },
      create: {
        uniqueId: parsed.uniqueId,
        callerNumber: parsed.callerNumber,
        destinationNumber: parsed.destinationNumber,
        direction: parsed.direction,
        status: 'ended',
        disposition: 'answered',
        agentId: ext?.agent?.id ?? null,
        subscriberId: subscriber?.id ?? null,
        startedAt: stat.birthtime,
        endedAt: stat.mtime,
        durationSec: duration,
        talkTimeSec: duration,
        waitTimeSec: 0,
      },
    });

    const recording = await prisma.recording.upsert({
      where: { callId: call.id },
      update: {
        callerNumber: parsed.callerNumber,
        agentId: ext?.agent?.id ?? null,
        fileName,
        durationSec: duration,
        sizeKb: Math.max(1, Math.round(stat.size / 1024)),
        recordedAt: stat.birthtime,
      },
      create: {
        callId: call.id,
        callerNumber: parsed.callerNumber,
        agentId: ext?.agent?.id ?? null,
        fileName,
        url: '',
        durationSec: duration,
        sizeKb: Math.max(1, Math.round(stat.size / 1024)),
        recordedAt: stat.birthtime,
      },
    });

    await prisma.recording.update({
      where: { id: recording.id },
      data: { url: `/api/recordings/${recording.id}/audio` },
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
    include: {
      agent: { select: { id: true, name: true } },
      call: { include: { subscriber: true, queue: true } },
    },
    orderBy: { recordedAt: 'desc' },
    take: 200,
  });

  const mapped = await Promise.all(rows.map(async (r) => {
    const safeName = path.basename(r.fileName);
    const exists = fs.existsSync(path.join(basePath, safeName));

    const callPhone = normalizePhone(r.call?.callerNumber || r.callerNumber);
    const linkedSubPhone = normalizePhone(r.call?.subscriber?.phone);
    const linkedSubUser = normalizePhone(r.call?.subscriber?.pppoeUsername);

    let subscriber = null;

    if (
      r.call?.subscriber &&
      callPhone &&
      (callPhone === linkedSubPhone || callPhone === linkedSubUser)
    ) {
      subscriber = r.call.subscriber;
    } else if (callPhone) {
      subscriber = await findSubscriberByPhone(callPhone);
    }

    return {
      ...r,
      callerNumber: r.call?.callerNumber || r.callerNumber,
      subscriberId: subscriber?.id ?? null,
      subscriberName: subscriber?.name ?? null,
      queueName: r.call?.queue?.name ?? null,
      queueId: r.call?.queueId ?? null,
      fileExists: exists,
      url: exists ? `/api/recordings/${r.id}/audio` : null,
    };
  }));

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
