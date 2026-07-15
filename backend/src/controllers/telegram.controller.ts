import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const URL = process.env.TG_GATEWAY_URL || 'http://telegram-gateway:4200';
const TOKEN = process.env.TG_GATEWAY_TOKEN || 'tg_internal_please_change_123';

async function tg(path: string, options: RequestInit = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Telegram gateway error ${res.status}`);
  return data;
}

async function getApiSettings() {
  const row = await prisma.setting.findUnique({ where: { key: 'telegram_api_settings' } }).catch(() => null);
  return (row?.value as any) || {};
}

export const getApi = asyncHandler(async (_req: Request, res: Response) => {
  const s = await getApiSettings();
  res.json({
    apiId: s.apiId || '',
    hasApiHash: !!s.apiHash,
    apiHash: s.apiHash || '',
  });
});

export const saveApi = asyncHandler(async (req: Request, res: Response) => {
  const apiId = String(req.body?.apiId || '').trim();
  const apiHash = String(req.body?.apiHash || '').trim();

  if (!apiId || !apiHash) return res.status(400).json({ error: 'API ID و API HASH مطلوبة' });

  const value = { apiId, apiHash };

  await prisma.setting.upsert({
    where: { key: 'telegram_api_settings' },
    update: { value },
    create: { key: 'telegram_api_settings', value },
  });

  res.json({ ok: true, apiId, hasApiHash: true });
});

async function refreshStatus(sessionId: string) {
  try {
    const st: any = await tg(`/sessions/status/${encodeURIComponent(sessionId)}`);
    await prisma.telegramSession.update({
      where: { sessionId },
      data: {
        status: st.status || 'unknown',
        lastError: st.lastError || null,
        connectedAt: st.connectedAt ? new Date(st.connectedAt) : undefined,
      },
    }).catch(() => null);
    return st;
  } catch (e: any) {
    await prisma.telegramSession.update({
      where: { sessionId },
      data: { status: 'error', lastError: e?.message || String(e) },
    }).catch(() => null);
    return null;
  }
}

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.telegramSession.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ sessions: rows });
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const api = await getApiSettings();
  if (!api.apiId || !api.apiHash) {
    return res.status(400).json({ error: 'احفظ API ID و API HASH أولاً' });
  }

  const name = String(req.body?.name || '').trim() || `Telegram ${new Date().toLocaleString('ar-IQ')}`;
  const sessionId = String(req.body?.sessionId || `tg_${crypto.randomUUID()}`);

  const row = await prisma.telegramSession.upsert({
    where: { sessionId },
    update: { name, active: true, status: 'starting' },
    create: { sessionId, name, status: 'starting' },
  });

  await tg('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      apiId: api.apiId,
      apiHash: api.apiHash,
      force: !!req.body?.force,
    }),
  });

  res.json({ ok: true, session: row });
});

export const status = asyncHandler(async (req: Request, res: Response) => {
  const st = await refreshStatus(req.params.sessionId);
  res.json(st || { status: 'error' });
});

export const qr = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tg(`/sessions/qr/${encodeURIComponent(req.params.sessionId)}`));
});

export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId || req.body?.sessionId || '').trim();

  await tg('/sessions/logout', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  }).catch(() => null);

  await prisma.telegramMessageLog.deleteMany({ where: { sessionId } }).catch(() => null);
  await prisma.telegramSession.delete({ where: { sessionId } }).catch(() => null);

  res.json({ ok: true, deleted: true, sessionId });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  const row = await prisma.telegramSession.update({
    where: { sessionId },
    data: {
      delayMin: Number(req.body?.delayMin || 5),
      delayMax: Number(req.body?.delayMax || 15),
      dailyLimit: Number(req.body?.dailyLimit || 200),
      active: req.body?.active === undefined ? undefined : !!req.body.active,
    },
  });

  res.json({ ok: true, session: row });
});

async function chooseSession() {
  const rows = await prisma.telegramSession.findMany({
    where: { active: true, status: 'connected' },
    orderBy: [{ sentToday: 'asc' }, { updatedAt: 'asc' }],
  });

  return rows.find((x) => Number(x.sentToday || 0) < Number(x.dailyLimit || 200)) || null;
}

export const send = asyncHandler(async (req: Request, res: Response) => {
  const to = String(req.body?.to || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

  const session = req.body?.sessionId
    ? await prisma.telegramSession.findUnique({ where: { sessionId: String(req.body.sessionId) } })
    : await chooseSession();

  if (!session) return res.status(409).json({ error: 'No connected Telegram sessions' });

  const log = await prisma.telegramMessageLog.create({
    data: { sessionId: session.sessionId, to, message, status: 'sending' },
  });

  try {
    await tg('/send', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.sessionId, to, message }),
    });

    await prisma.telegramMessageLog.update({
      where: { id: log.id },
      data: { status: 'sent', finishedAt: new Date() },
    });

    await prisma.telegramSession.update({
      where: { sessionId: session.sessionId },
      data: { sentToday: { increment: 1 } },
    });

    res.json({ ok: true, sessionId: session.sessionId, logId: log.id });
  } catch (e: any) {
    await prisma.telegramMessageLog.update({
      where: { id: log.id },
      data: { status: 'failed', error: e?.message || String(e), finishedAt: new Date() },
    });

    await prisma.telegramSession.update({
      where: { sessionId: session.sessionId },
      data: { failedToday: { increment: 1 }, lastError: e?.message || String(e) },
    }).catch(() => null);

    res.status(500).json({ error: e?.message || String(e) });
  }
});

export const logs = asyncHandler(async (_req: Request, res: Response) => {
  const logs = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.*, COALESCE(s.name, l.sessionId) AS sessionName
    FROM TelegramMessageLog l
    LEFT JOIN TelegramSession s ON s.sessionId = l.sessionId
    ORDER BY l.createdAt DESC
    LIMIT 120
  `);

  res.json({ logs });
});
