import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const URL = process.env.WA_GATEWAY_URL || 'http://wa-gateway:4100';
const TOKEN = process.env.WA_GATEWAY_TOKEN || 'change-me';

async function gw(path: string, options: RequestInit = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `WA gateway error ${res.status}`);
  return data;
}

function randomDelayMs(min: any, max: any) {
  const a = Math.max(1, Number(min || 5));
  const b = Math.max(a, Number(max || 15));
  return (Math.floor(Math.random() * (b - a + 1)) + a) * 1000;
}

function spinMessage(message: string) {
  return String(message || '').replace(/\{rand:([^}]+)\}/g, (_m, body) => {
    const parts = String(body).split('|').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts[Math.floor(Math.random() * parts.length)] : '';
  });
}

async function refreshStatus(sessionId: string) {
  try {
    const st: any = await gw(`/sessions/status/${encodeURIComponent(sessionId)}`);
    await prisma.whatsappSession.update({
      where: { sessionId },
      data: {
        status: st.status || 'unknown',
        lastError: st.lastError || null,
        connectedAt: st.connectedAt ? new Date(st.connectedAt) : undefined,
      },
    });
    return st;
  } catch (e: any) {
    await prisma.whatsappSession.update({ where: { sessionId }, data: { status: 'error', lastError: e?.message || String(e) } }).catch(() => null);
    return null;
  }
}

async function chooseSession() {
  const rows = await prisma.whatsappSession.findMany({
    where: { active: true, status: 'connected' },
    orderBy: [{ sentToday: 'asc' }, { updatedAt: 'asc' }],
  });
  return rows.find((x) => Number(x.sentToday || 0) < Number(x.dailyLimit || 200)) || null;
}

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.whatsappSession.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ sessions: rows });
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim() || `واتساب ${new Date().toLocaleString('ar-IQ')}`;
  const sessionId = String(req.body?.sessionId || `wa_${crypto.randomUUID()}`);

  const row = await prisma.whatsappSession.upsert({
    where: { sessionId },
    update: { name, active: true, status: 'starting' },
    create: { sessionId, name, status: 'starting' },
  });

  await gw('/sessions/start', { method: 'POST', body: JSON.stringify({ sessionId, force: !!req.body?.force }) });
  res.json({ ok: true, session: row });
});

export const status = asyncHandler(async (req: Request, res: Response) => {
  const st = await refreshStatus(req.params.sessionId);
  res.json(st || { status: 'error' });
});

export const qr = asyncHandler(async (req: Request, res: Response) => {
  res.json(await gw(`/sessions/qr/${encodeURIComponent(req.params.sessionId)}`));
});

export const pairCode = asyncHandler(async (req: Request, res: Response) => {
  res.json(await gw(`/sessions/pair-code/${encodeURIComponent(req.params.sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({ phone: req.body?.phone }),
  }));
});


export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId || req.body?.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  await gw('/sessions/logout', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  }).catch(() => null);

  await prisma.whatsappMessageLog.deleteMany({
    where: { sessionId },
  }).catch(() => null);

  await prisma.whatsappSession.delete({
    where: { sessionId },
  }).catch(() => null);

  res.json({ ok: true, deleted: true, sessionId });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  await gw('/sessions/logout', { method: 'POST', body: JSON.stringify({ sessionId }) }).catch(() => null);
  await prisma.whatsappSession.update({ where: { sessionId }, data: { status: 'disconnected', active: false } }).catch(() => null);
  res.json({ ok: true });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  const row = await prisma.whatsappSession.update({
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

export const send = asyncHandler(async (req: Request, res: Response) => {
  const to = String(req.body?.to || '').trim();
  const message = spinMessage(String(req.body?.message || '').trim());
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

  let session = req.body?.sessionId
    ? await prisma.whatsappSession.findUnique({ where: { sessionId: String(req.body.sessionId) } })
    : await chooseSession();

  if (!session && req.body?.sessionId) {
    await refreshStatus(String(req.body.sessionId));
    session = await prisma.whatsappSession.findUnique({ where: { sessionId: String(req.body.sessionId) } });
  }

  if (!session) return res.status(409).json({ error: 'No connected WhatsApp sessions' });

  const log = await prisma.whatsappMessageLog.create({
    data: { sessionId: session.sessionId, to, message, status: 'sending' },
  });

  try {
    await gw('/send', { method: 'POST', body: JSON.stringify({ sessionId: session.sessionId, to, message, delay: randomDelayMs((session as any).delayMin, (session as any).delayMax) }) });
    await prisma.whatsappMessageLog.update({
      where: { id: log.id },
      data: { status: 'sent', finishedAt: new Date() },
    });
    await prisma.whatsappSession.update({
      where: { sessionId: session.sessionId },
      data: { sentToday: { increment: 1 } },
    });
    res.json({ ok: true, sessionId: session.sessionId, logId: log.id });
  } catch (e: any) {
    await prisma.whatsappMessageLog.update({
      where: { id: log.id },
      data: { status: 'failed', error: e?.message || String(e), finishedAt: new Date() },
    });
    await prisma.whatsappSession.update({
      where: { sessionId: session.sessionId },
      data: { failedToday: { increment: 1 }, lastError: e?.message || String(e) },
    }).catch(() => null);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

export const logs = asyncHandler(async (_req: Request, res: Response) => {
  const logs = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      l.*,
      COALESCE(s.name, l.sessionId) AS sessionName
    FROM WhatsappMessageLog l
    LEFT JOIN WhatsappSession s ON s.sessionId = l.sessionId
    ORDER BY l.createdAt DESC
    LIMIT 120
  `);

  res.json({ logs });
});
