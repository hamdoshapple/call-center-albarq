import { createHash, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import webpush from 'web-push';
import Twilio from 'twilio';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { searchExternalSubscribers, listExternalSubscribersForCache, listTodayExternalFinanceEvents } from '../services/external-subscriber.service.js';

const VAPID_PUBLIC_KEY = 'BJjYxPn0SyB-EMzUAIFbbpZNL5sDODn4hm779RcGRzZOuspNnHWkX_6FbbTdSWaE5_S6cmVhG0Z8RBc48Odvn7o';
const VAPID_PRIVATE_KEY = '0mDNdlscgDSoriN-3kBQdkIi4ep1ABcTr4ZYay1-NfQ';

const webPushClient: any = (webpush as any).default || webpush;

webPushClient.setVapidDetails(
  'mailto:admin@albarq.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function cuid() {
  return 'push_' + crypto.randomUUID().replace(/-/g, '');
}

function norm(v: unknown) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}


const WA_GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://wa-gateway:4100';
const WA_GATEWAY_TOKEN = process.env.WA_GATEWAY_TOKEN || 'change-me';

async function whatsappGateway(path: string, body: any) {
  const res = await fetch(`${WA_GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `WhatsApp gateway error ${res.status}`);
  return data;
}


async function getWhatsappQueueSettings() {
  const defaults = {
    maxFailedToday: 10,
    maxFailRate: 15,
    windowHours: 24,
    queueMode: 'balanced',
    fingerprintEnabled: true,
    uniqueMessageEnabled: true,
    fingerprintMinLetters: 2,
    fingerprintMaxLetters: 3,
    fingerprintMinDigits: 1000,
    fingerprintMaxDigits: 9999,
    fingerprintLabels: ['رمز المتابعة', 'مرجع الخدمة', 'رقم العملية', 'رقم الطلب', 'كود الخدمة', 'معرّف الرسالة'],
    extraDelayEvery: 20,
    extraDelaySeconds: 60,
    warmupEnabled: true,
    warmupHours: 72,
    warmupDailyLimit: 30,
    cooldownEnabled: true,
    cooldownMinutes: 30,
  };
  const row = await prisma.setting.findUnique({ where: { key: 'whatsapp_queue_settings' } }).catch(() => null);
  const v: any = row?.value || {};
  return {
    ...defaults,
    ...(v || {}),
    maxFailedToday: Number(v.maxFailedToday ?? defaults.maxFailedToday),
    maxFailRate: Number(v.maxFailRate ?? defaults.maxFailRate),
    windowHours: Number(v.windowHours ?? defaults.windowHours),
    fingerprintMinLetters: Number(v.fingerprintMinLetters ?? defaults.fingerprintMinLetters),
    fingerprintMaxLetters: Number(v.fingerprintMaxLetters ?? defaults.fingerprintMaxLetters),
    fingerprintMinDigits: Number(v.fingerprintMinDigits ?? defaults.fingerprintMinDigits),
    fingerprintMaxDigits: Number(v.fingerprintMaxDigits ?? defaults.fingerprintMaxDigits),
    extraDelayEvery: Number(v.extraDelayEvery ?? defaults.extraDelayEvery),
    extraDelaySeconds: Number(v.extraDelaySeconds ?? defaults.extraDelaySeconds),
    warmupHours: Number(v.warmupHours ?? defaults.warmupHours),
    warmupDailyLimit: Number(v.warmupDailyLimit ?? defaults.warmupDailyLimit),
    cooldownMinutes: Number(v.cooldownMinutes ?? defaults.cooldownMinutes),
  };
}

let lastWhatsappSendAt = 0;
let whatsappSentCounter = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minSeconds: any, maxSeconds: any) {
  const min = Math.max(1, Number(minSeconds || 5));
  const max = Math.max(min, Number(maxSeconds || min || 15));
  return Math.floor((min + Math.random() * (max - min + 1)) * 1000);
}


async function getWhatsappCooldowns() {
  const row = await prisma.setting.findUnique({ where: { key: 'whatsapp_session_cooldowns' } }).catch(() => null);
  return ((row?.value as any) || {}) as Record<string, number>;
}

async function setWhatsappCooldown(sessionId: string, minutes: number) {
  const current = await getWhatsappCooldowns();
  current[sessionId] = Date.now() + Math.max(1, Number(minutes || 30)) * 60 * 1000;

  await prisma.setting.upsert({
    where: { key: 'whatsapp_session_cooldowns' },
    update: { value: current as any },
    create: { key: 'whatsapp_session_cooldowns', value: current as any },
  }).catch(() => null);
}

async function waitBeforeWhatsappSend(session: any, q: any) {
  if (Number(q.extraDelayEvery || 0) > 0 && whatsappSentCounter > 0 && whatsappSentCounter % Number(q.extraDelayEvery || 20) === 0) {
    await sleep(Math.max(1, Number(q.extraDelaySeconds || 60)) * 1000);
  }

  const delay = randomDelayMs(session?.delayMin, session?.delayMax);
  const elapsed = Date.now() - lastWhatsappSendAt;

  if (lastWhatsappSendAt > 0 && elapsed < delay) {
    await sleep(delay - elapsed);
  }

  lastWhatsappSendAt = Date.now();
  whatsappSentCounter++;
}


function messageFingerprint(q: any = {}) {
  if (q.fingerprintEnabled === false || q.uniqueMessageEnabled === false) return '';

  const labels = Array.isArray(q.fingerprintLabels) && q.fingerprintLabels.length
    ? q.fingerprintLabels
    : ['رمز المتابعة', 'مرجع الخدمة', 'رقم العملية', 'رقم الطلب', 'كود الخدمة', 'معرّف الرسالة'];

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const label = labels[Math.floor(Math.random() * labels.length)];

  const minLetters = Math.max(1, Number(q.fingerprintMinLetters || 2));
  const maxLetters = Math.max(minLetters, Number(q.fingerprintMaxLetters || 3));
  const lettersLen = minLetters + Math.floor(Math.random() * (maxLetters - minLetters + 1));

  const letters = Array.from(
    { length: lettersLen },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');

  const minDigits = Math.max(1, Number(q.fingerprintMinDigits || 1000));
  const maxDigits = Math.max(minDigits, Number(q.fingerprintMaxDigits || 9999));
  const digits = Math.floor(minDigits + Math.random() * (maxDigits - minDigits + 1));

  const forms = [
    `${label}: ${letters}-${digits}`,
    `${label}: ${digits}-${letters}`,
    `${label}: ${letters}${digits}`,
  ];

  return `

${forms[Math.floor(Math.random() * forms.length)]}`;
}

function uniqueWhatsappMessage(text: string, q: any = {}) {
  const base = String(text || '').trim();
  if (q.uniqueMessageEnabled === false) return base;
  return `${base}${messageFingerprint(q)}`;
}


async function refreshWhatsappSessionStatus(sessionId: string) {
  try {
    const res = await fetch(`${WA_GATEWAY_URL}/sessions/status/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${WA_GATEWAY_TOKEN}` },
    });
    const data: any = await res.json().catch(() => ({}));
    const status = String(data.status || 'unknown');

    await prisma.whatsappSession.update({
      where: { sessionId },
      data: {
        status,
        lastError: data.lastError || null,
        active: status === 'connected' ? undefined : false,
      } as any,
    }).catch(() => null);

    return status;
  } catch {
    return 'error';
  }
}

async function chooseWhatsappSession() {
  const q = await getWhatsappQueueSettings();
  const cooldowns = await getWhatsappCooldowns();
  const now = Date.now();

  let rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      s.*,
      COALESCE(x.totalWindow,0) AS totalWindow,
      COALESCE(x.failedWindow,0) AS failedWindow,
      CASE
        WHEN COALESCE(x.totalWindow,0)=0 THEN 0
        ELSE ROUND(COALESCE(x.failedWindow,0) / x.totalWindow * 100, 2)
      END AS failRate
    FROM WhatsappSession s
    LEFT JOIN (
      SELECT sessionId, COUNT(*) AS totalWindow, SUM(status='failed') AS failedWindow
      FROM WhatsappMessageLog
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY sessionId
    ) x ON x.sessionId = s.sessionId
    WHERE s.active=1
      AND s.status='connected'
      AND COALESCE(s.sentToday,0) < COALESCE(s.dailyLimit,200)
  `, Number(q.windowHours || 24)).catch(() => []);

  rows = rows.filter((x: any) => Number(cooldowns[x.sessionId] || 0) <= now);

  rows = rows.filter((x: any) => {
    if (!q.warmupEnabled) return true;
    const startedAt = new Date(x.connectedAt || x.createdAt || x.updatedAt || 0).getTime();
    const ageHours = startedAt ? (now - startedAt) / 3600000 : 999999;
    if (ageHours > Number(q.warmupHours || 72)) return true;
    return Number(x.sentToday || 0) < Number(q.warmupDailyLimit || 30);
  });

  if (!rows.length) return null;

  const verified: any[] = [];
  for (const row of rows) {
    const st = await refreshWhatsappSessionStatus(row.sessionId);
    if (st === 'connected') verified.push(row);
  }

  rows = verified;
  if (!rows.length) return null;

  const healthy = rows.filter((x: any) =>
    Number(x.failedToday || 0) < Number(q.maxFailedToday || 10) &&
    Number(x.failRate || 0) < Number(q.maxFailRate || 15)
  );

  const pool = healthy.length ? healthy : rows;
  const mode = String(q.queueMode || 'balanced');

  pool.sort((a: any, b: any) => {
    if (mode === 'least_sent') return Number(a.sentToday || 0) - Number(b.sentToday || 0);
    if (mode === 'least_failed') return Number(a.failedToday || 0) - Number(b.failedToday || 0);
    const scoreA = Number(a.sentToday || 0) + Number(a.failedToday || 0) * 5 + Number(a.failRate || 0) * 2;
    const scoreB = Number(b.sentToday || 0) + Number(b.failedToday || 0) * 5 + Number(b.failRate || 0) * 2;
    return scoreA - scoreB;
  });

  return pool[0] || null;
}

function waSpin(message: string) {
  return String(message || '').replace(/\{rand:([^}]+)\}/g, (_m, body) => {
    const parts = String(body).split('|').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts[Math.floor(Math.random() * parts.length)] : '';
  });
}

async function getWhatsappPhones(targetType: string, targetValue = '') {
  if (targetType === 'phone') {
    return Array.from(new Set(targetValue.split(/[,\n]/).map(norm).filter(Boolean)));
  }

  if (targetType === 'debt') {
    const minDebt = Number(targetValue || 1);
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT normalizedPhone AS phone FROM SubscriberCache WHERE debt >= ?
      UNION
      SELECT phoneNorm AS phone FROM ExternalSubscriberCache WHERE debt >= ?
    `, minDebt, minDebt);
    return Array.from(new Set(rows.map((x) => norm(x.phone)).filter(Boolean)));
  }

  if (targetType === 'expire_days') {
    const days = Number(targetValue || 3);
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT normalizedPhone AS phone FROM SubscriberCache
      WHERE expiration IS NOT NULL AND DATE(expiration) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
      UNION
      SELECT phoneNorm AS phone FROM ExternalSubscriberCache
      WHERE expiration IS NOT NULL AND DATE(expiration) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
    `, days, days);
    return Array.from(new Set(rows.map((x) => norm(x.phone)).filter(Boolean)));
  }

  if (targetType === 'expired') {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT normalizedPhone AS phone FROM SubscriberCache
      WHERE expiration IS NOT NULL AND DATE(expiration) < CURDATE()
      UNION
      SELECT phoneNorm AS phone FROM ExternalSubscriberCache
      WHERE expiration IS NOT NULL AND DATE(expiration) < CURDATE()
    `);
    return Array.from(new Set(rows.map((x) => norm(x.phone)).filter(Boolean)));
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT phoneNorm AS phone FROM SubscriberPushSubscription WHERE active=1
    UNION
    SELECT normalizedPhone AS phone FROM SubscriberCache WHERE normalizedPhone IS NOT NULL AND normalizedPhone <> ''
    UNION
    SELECT phoneNorm AS phone FROM ExternalSubscriberCache WHERE phoneNorm IS NOT NULL AND phoneNorm <> ''
  `);
  return Array.from(new Set(rows.map((x) => norm(x.phone)).filter(Boolean)));
}

export async function sendWhatsappToPhones(phones: string[], message: string) {
  const cleanPhones = Array.from(new Set((phones || []).map(norm).filter(Boolean)));
  if (!cleanPhones.length) return { targets: 0, sent: 0, failed: 0 };

  const q = await getWhatsappQueueSettings();

  let sent = 0;
  let failed = 0;
  let lastSessionId = '';

  for (let i = 0; i < cleanPhones.length; i++) {
    const phone = cleanPhones[i];
    const session = await chooseWhatsappSession();

    if (!session) {
      failed++;
      await prisma.whatsappMessageLog.create({
        data: { sessionId: 'no-session', to: phone, message, status: 'failed', error: 'No connected WhatsApp session', finishedAt: new Date() } as any,
      }).catch(() => null);
      continue;
    }

    lastSessionId = session.sessionId;

    try {
      const text = uniqueWhatsappMessage(waSpin(message), q);

      await waitBeforeWhatsappSend(session, q);

      await whatsappGateway('/send', {
        sessionId: session.sessionId,
        to: phone,
        message: text,
        delay: randomDelayMs((session as any).delayMin, (session as any).delayMax),
      });

      await prisma.whatsappMessageLog.create({
        data: { sessionId: session.sessionId, to: phone, message: text, status: 'sent', finishedAt: new Date() } as any,
      }).catch(() => null);

      await prisma.whatsappSession.update({
        where: { sessionId: session.sessionId },
        data: { sentToday: { increment: 1 } },
      }).catch(() => null);

      sent++;
    } catch (e: any) {
      failed++;

      await prisma.whatsappMessageLog.create({
        data: { sessionId: session.sessionId, to: phone, message, status: 'failed', error: e?.message || String(e), finishedAt: new Date() } as any,
      }).catch(() => null);

      await prisma.whatsappSession.update({
        where: { sessionId: session.sessionId },
        data: { failedToday: { increment: 1 }, lastError: e?.message || String(e) },
      }).catch(() => null);

      if (q.cooldownEnabled) {
        await setWhatsappCooldown(session.sessionId, Number(q.cooldownMinutes || 30));
      }
    }
  }

  return { targets: cleanPhones.length, sent, failed, sessionId: lastSessionId };
}

function secret() {
  return process.env.SUBSCRIBER_PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'subscriber-portal-secret';
}

function verifySubscriber(req: Request) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return jwt.verify(token, secret()) as { phone: string; type: string };
}

function adminUserId(req: Request) {
  return (req as any).user?.id || null;
}

function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  ));
}

export const publicKey = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const payload = verifySubscriber(req);
  const phone = norm(payload.phone);
  const sub = req.body?.subscription || req.body;

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const endpointHash = crypto.createHash('sha256').update(sub.endpoint).digest('hex');

  try {
    await prisma.subscriberPushSubscription.upsert({
      where: { endpointHash },
      update: {
        phone: payload.phone,
        phoneNorm: phone,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: String(req.headers['user-agent'] || ''),
        active: true,
      } as any,
      create: {
        id: cuid(),
        phone: payload.phone,
        phoneNorm: phone,
        endpointHash,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: String(req.headers['user-agent'] || ''),
        active: true,
      } as any,
    });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[push.subscribe] failed', e?.code, e?.message, e?.meta || '');
    return res.status(500).json({
      error: 'Push subscribe failed',
      code: e?.code || null,
      message: e?.message || String(e),
      meta: e?.meta || null,
    });
  }
});

async function getTargets(targetType: string, targetValue = '') {
  if (targetType === 'phone') {
    const phones = targetValue.split(/[,\n]/).map(norm).filter(Boolean);
    if (!phones.length) return [];
    const placeholders = phones.map(() => '?').join(',');
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM SubscriberPushSubscription
      WHERE active=1 AND phoneNorm IN (${placeholders})
    `, ...phones);
  }

  if (targetType === 'debt') {
    const minDebt = Number(targetValue || 1);
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ps.*
      FROM SubscriberPushSubscription ps
      WHERE ps.active=1
      AND ps.phoneNorm IN (
        SELECT normalizedPhone FROM SubscriberCache WHERE debt >= ?
        UNION
        SELECT phoneNorm FROM ExternalSubscriberCache WHERE debt >= ?
      )
    `, minDebt, minDebt);
  }

  if (targetType === 'expire_days') {
    const days = Number(targetValue || 3);
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ps.*
      FROM SubscriberPushSubscription ps
      WHERE ps.active=1
      AND ps.phoneNorm IN (
        SELECT normalizedPhone FROM SubscriberCache
        WHERE expiration IS NOT NULL AND DATE(expiration) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        UNION
        SELECT phoneNorm FROM ExternalSubscriberCache
        WHERE expiration IS NOT NULL AND DATE(expiration) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
      )
    `, days, days);
  }

  if (targetType === 'expired') {
    return prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT ps.*
      FROM SubscriberPushSubscription ps
      WHERE ps.active=1
      AND ps.phoneNorm IN (
        SELECT normalizedPhone FROM SubscriberCache
        WHERE expiration IS NOT NULL AND DATE(expiration) < CURDATE()
        UNION
        SELECT phoneNorm FROM ExternalSubscriberCache
        WHERE expiration IS NOT NULL AND DATE(expiration) < CURDATE()
      )
    `);
  }

  return prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM SubscriberPushSubscription
    WHERE active=1
    ORDER BY updatedAt DESC
  `);
}

async function logPush(row: any, payload: any, targetType: string, status: string, error = '') {
  await prisma.pushNotificationLog.create({
    data: {
      phone: row?.phone || row?.phoneNorm || null,
      title: payload?.title || 'إشعار',
      message: payload?.body || payload?.message || '',
      targetType,
      status,
      error: error || null,
    } as any,
  }).catch(() => null);
}

async function sendOne(row: any, payload: any, targetType = 'manual') {
  const subscription = {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };

  try {
    console.log('[push.sendOne] sending', {
      id: row.id,
      phone: row.phone,
      endpoint: String(row.endpoint || '').slice(0, 90),
      title: payload?.title,
      url: payload?.url,
    });
    await webPushClient.sendNotification(subscription as any, JSON.stringify(payload));
    return true;
  } catch (e: any) {
    console.error('[push.sendOne] failed', {
      id: row.id,
      phone: row.phone,
      statusCode: e?.statusCode,
      headers: e?.headers,
      body: e?.body,
      message: e?.message,
    });

    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await prisma.$executeRawUnsafe(
        `UPDATE SubscriberPushSubscription SET active=0 WHERE id=?`,
        row.id
      );
    }
    await logPush(row, payload, targetType, 'failed', e?.body || e?.message || String(e));
    return false;
  }
}


export async function sendPushToPhones(phones: string[], title: string, message: string, url = '/my') {
  const basePhones = Array.from(new Set((phones || []).map(norm).filter(Boolean)));
  if (!basePhones.length) return { targets: 0, sent: 0, failed: 0 };

  const variants = Array.from(new Set(basePhones.flatMap((p) => {
    const n = String(p || '').replace(/\D/g, '');
    return [
      n,
      n.startsWith('0') ? n.slice(1) : n,
      n.startsWith('964') ? n.slice(3) : n,
      n.startsWith('964') ? '0' + n.slice(3) : '0' + n,
      n.startsWith('964') ? n : '964' + (n.startsWith('0') ? n.slice(1) : n),
    ].filter(Boolean);
  })));

  const placeholders = variants.map(() => '?').join(',');
  const targets = await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM SubscriberPushSubscription
    WHERE active=1
      AND (phoneNorm IN (${placeholders}) OR phone IN (${placeholders}))
  `, ...variants, ...variants);

  let sent = 0;
  let failed = 0;

  const payload = {
    title,
    body: message,
    icon: '/icons/apple-touch-icon.png',
    badge: '/icons/apple-touch-icon.png',
    url,
    tag: 'albarq-auto-' + Date.now(),
  };

  for (const row of targets) {
    const ok = await sendOne(row, payload, 'phone');
    if (ok) sent++;
    else failed++;
  }

  return { targets: targets.length, sent, failed };
}


function normalizeAutoChannel(v: any) {
  const x = String(v || 'push');
  if (['off', 'none', 'disabled'].includes(x)) return 'off';
  if (['push', 'whatsapp', 'both', 'all'].includes(x)) return x;
  return 'push';
}

function usesPushChannel(ch: any) {
  const x = normalizeAutoChannel(ch);
  return x === 'push' || x === 'both' || x === 'all';
}

function usesWhatsappChannel(ch: any) {
  const x = normalizeAutoChannel(ch);
  return x === 'whatsapp' || x === 'both' || x === 'all';
}

async function sendAutoByChannel(phone: string, title: string, message: string, targetType: string, channel: any) {
  const ch = normalizeAutoChannel(channel);
  const out: any = {
    channel: ch,
    push: { targets: 0, sent: 0, failed: 0 },
    whatsapp: { targets: 0, sent: 0, failed: 0 },
    sent: 0,
    failed: 0,
  };

  if (ch === 'off') return out;

  if (usesPushChannel(ch)) {
    out.push = await sendPushToPhones([phone], title, message, '/my');
  }

  if (usesWhatsappChannel(ch)) {
    out.whatsapp = await sendWhatsappToPhones([phone], `${title}\n\n${message}`);
  }

  out.sent = Number(out.push.sent || 0) + Number(out.whatsapp.sent || 0);
  out.failed = Number(out.push.failed || 0) + Number(out.whatsapp.failed || 0);

  await prisma.pushNotificationLog.create({
    data: {
      phone,
      title,
      message,
      targetType: `${targetType}:${ch}`,
      status: out.sent > 0 ? 'sent' : 'failed',
      error: out.failed > 0 ? `push=${out.push.failed || 0} whatsapp=${out.whatsapp.failed || 0}` : null,
    } as any,
  }).catch(() => null);

  return out;
}


export const employeeSubscribe = asyncHandler(async (req: Request, res: Response) => {
  const user: any = (req as any).user || {};
  let userId = String(user.id || user.userId || user.sub || '').trim();

  if (!userId) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const payload: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        userId = String(payload.id || payload.userId || payload.sub || '').trim();
      } catch {}
    }
  }

  if (!userId) {
    return res.status(401).json({ message: 'UNAUTHORIZED' });
  }

  const subscription = req.body?.subscription || req.body;
  const endpoint = String(subscription?.endpoint || '');
  const p256dh = String(subscription?.keys?.p256dh || '');
  const auth = String(subscription?.keys?.auth || '');

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ message: 'INVALID_SUBSCRIPTION' });
  }

  const endpointHash = createHash('sha256').update(endpoint).digest('hex');
  const employeeKey = `employee:${userId}`;

  await prisma.subscriberPushSubscription.upsert({
    where: { endpointHash },
    create: {
      id: randomUUID(),
      phone: employeeKey,
      phoneNorm: employeeKey,
      endpointHash,
      endpoint,
      p256dh,
      auth,
      userAgent: String(req.headers['user-agent'] || ''),
      active: true,
    },
    update: {
      phone: employeeKey,
      phoneNorm: employeeKey,
      endpoint,
      p256dh,
      auth,
      userAgent: String(req.headers['user-agent'] || ''),
      active: true,
    },
  });

  res.json({ ok: true });
});

export async function sendPushToEmployees(title: string, message: string, url = '/employee/whatsapp', extra: any = {}) {
  const employeeIds = Array.isArray(extra.employeeIds) ? extra.employeeIds.map((x: any) => String(x)).filter(Boolean) : [];
  const employeeKeys = employeeIds.map((id: string) => `employee:${id}`);

  const targets = await prisma.subscriberPushSubscription.findMany({
    where: {
      active: true,
      ...(employeeKeys.length
        ? { phoneNorm: { in: employeeKeys } }
        : { phoneNorm: { startsWith: 'employee:' } }),
    },
    take: 200,
  });

  let sent = 0;
  let failed = 0;

  const payload = {
    title,
    body: message,
    icon: extra.icon || '/icon-192.png',
    badge: extra.badge || '/icon-192.png',
    url,
    tag: extra.tag || ('albarq-staff-wa-' + Date.now()),
    conversationId: extra.conversationId || '',
    ticketId: extra.ticketId || '',
    callId: extra.callId || '',
    type: extra.type || '',
    unread: Number(extra.unread || 1),
  };

  for (const row of targets) {
    const ok = await sendOne(row as any, payload, 'employee');
    if (ok) sent++;
    else failed++;
  }

  return { targets: targets.length, sent, failed };
}


export const autoExpiryDebt = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getNotificationSettingsObject();

  if (!settings?.auto?.enabled) {
    return res.json({ ok: true, skipped: true, reason: 'auto notifications disabled' });
  }

  const results: any[] = [];

  async function sendRows(rows: any[], targetType: string, title: string, messageTpl: string, days = '') {
    let sent = 0;
    let failed = 0;
    let skippedDuplicate = 0;

    for (const row of rows) {
      const phone = row.phoneNorm || row.normalizedPhone || row.phone;
      if (!phone) continue;

      const name = String(row.name || row.pppoeUsername || 'مشترك');
      const pppoe = String(row.pppoeUsername || '—');
      const date = row.expiration ? new Date(row.expiration).toLocaleDateString('ar-IQ') : '—';

      const message = String(messageTpl || '')
        .replaceAll('{name}', name)
        .replaceAll('{pppoe}', pppoe)
        .replaceAll('{date}', date)
        .replaceAll('{days}', String(days));

      const todayCount = await prisma.pushNotificationLog.count({
        where: {
          phone: String(phone),
          targetType,
          title,
          message,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        } as any,
      }).catch(() => 0);

      if (todayCount > 0) {
        skippedDuplicate++;
        continue;
      }

      const channelKey = targetType.startsWith('expiry_before_') ? 'expiryBefore' : 'expired';
      const channel = (settings as any).channels?.[channelKey] || 'push';
      const r = await sendAutoByChannel(String(phone), title, message, targetType, channel);

      sent += r.sent;
      failed += r.failed;

      await prisma.$executeRawUnsafe(`
        INSERT INTO PushCampaign
        (id,title,message,targetType,targetValue,sentCount,failedCount,createdById)
        VALUES (?,?,?,?,?,?,?,?)
      `, cuid(), title, message, `${targetType}:${r.channel}`, phone, r.sent, r.failed, null);
    }

    results.push({ targetType, targets: rows.length, sent, failed, skippedDuplicate });
  }

  for (const d of settings.expiry.beforeDays || []) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT normalizedPhone AS phoneNorm, name, pppoeUsername, expiration
      FROM SubscriberCache
      WHERE expiration IS NOT NULL
        AND DATE(expiration) = DATE(DATE_ADD(NOW(), INTERVAL ? DAY))
      UNION ALL
      SELECT phoneNorm, name, pppoeUsername, expiration
      FROM ExternalSubscriberCache
      WHERE expiration IS NOT NULL
        AND DATE(expiration) = DATE(DATE_ADD(NOW(), INTERVAL ? DAY))
    `, Number(d), Number(d));

    await sendRows(
      rows,
      `expiry_before_${d}`,
      'اشتراكك ينتهي قريباً',
      settings.templates?.expireBefore || 'اشتراك {name} سينتهي بعد {days} يوم. تاريخ الانتهاء: {date}',
      String(d)
    );
  }

  for (const d of settings.expiry.afterDays || []) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT normalizedPhone AS phoneNorm, name, pppoeUsername, expiration
      FROM SubscriberCache
      WHERE expiration IS NOT NULL
        AND DATE(expiration) = DATE(DATE_SUB(NOW(), INTERVAL ? DAY))
      UNION ALL
      SELECT phoneNorm, name, pppoeUsername, expiration
      FROM ExternalSubscriberCache
      WHERE expiration IS NOT NULL
        AND DATE(expiration) = DATE(DATE_SUB(NOW(), INTERVAL ? DAY))
    `, Number(d), Number(d));

    await sendRows(
      rows,
      `expired_after_${d}`,
      'اشتراكك منتهي',
      settings.templates?.expired || 'اشتراك {name} منتهي منذ {days} يوم. تاريخ الانتهاء: {date}',
      String(d)
    );
  }

  if (settings?.debt?.enabled) {
    const debtChannel = (settings as any).channels?.debt || 'push';
    const title = 'يوجد مبلغ مستحق';
    const message = settings.templates?.debt || 'يوجد عليك مبلغ مستحق.';
    let sent = 0;
    let failed = 0;
    let targetPhones: string[] = [];

    if (usesWhatsappChannel(debtChannel)) {
      targetPhones = await getWhatsappPhones('debt', String(settings.debt.minAmount || 1000));
    } else {
      const targets = await getTargets('debt', String(settings.debt.minAmount || 1000));
      targetPhones = targets.map((x: any) => String(x.phoneNorm || x.normalizedPhone || x.phone || '')).filter(Boolean);
    }

    targetPhones = Array.from(new Set(targetPhones.map((x) => normPushPhone(x)).filter(Boolean)));

    for (const phone of targetPhones) {
      const r = await sendAutoByChannel(phone, title, message, 'auto_debt', debtChannel);
      sent += r.sent;
      failed += r.failed;
    }

    results.push({ targetType: `debt:${debtChannel}`, targets: targetPhones.length, sent, failed });
  }

  res.json({ ok: true, results });
});


function amountText(v: any) {
  return Number(v || 0).toLocaleString('en-US');
}

function cleanNullText(v: any) {
  return String(v || '').replace(/NULL/gi, '').replace(/\s+/g, ' ').trim();
}

function enDate(v: any) {
  if (!v) return '';
  try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v || ''); }
}

function renderFinanceTemplate(tpl: string, vars: Record<string, any>) {
  let out = String(tpl || '');
  const now = new Date();
  const all: Record<string, any> = {
    company: 'البرق الرقمي',
    today: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    datetime: now.toISOString().replace('T', ' ').slice(0, 16),
    name: '', phone: '', pppoe: '', package: '',
    packagePrice: '', amount: '', paid: '',
    debt: '', totalDebt: '', remaining: '',
    receipt: '', transactionId: '',
    date: '', expireDate: '', status: '', type: '',
    ...vars,
  };
  for (const [k, v] of Object.entries(all)) out = out.replaceAll(`{${k}}`, String(v ?? ''));
  return out;
}




async function addSubscriberInAppNotification(phone: string, title: string, message: string, type = 'finance') {
  const n = String(phone || '').replace(/\D/g, '');
  const variants = Array.from(new Set([
    n,
    n.startsWith('964') ? '0' + n.slice(3) : n,
    n.startsWith('0') ? '964' + n.slice(1) : n,
  ].filter(Boolean)));

  for (const ph of variants) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO SubscriberPortalNotification
      (id, phone, title, message, type, readAt, createdAt)
      VALUES (?,?,?,?,?,NULL,NOW(3))
    `, cuid(), ph, title, message, type).catch(() => null);
  }
}

function financeTitle(type: string) {
  if (type === 'payment') return 'تم تسديد دفعة';
  if (type === 'activation') return 'تم تفعيل الاشتراك';
  if (type === 'debt') return 'تمت إضافة دين';
  return 'حركة مالية جديدة';
}

export const financeEventWatcher = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getNotificationSettingsObject();
  if (!settings?.auto?.enabled) {
    return res.json({ ok: true, skipped: true, reason: 'auto notifications disabled' });
  }

  const events = await listTodayExternalFinanceEvents();

  const result = {
    source: 'mssql_today_sand',
    scanned: events.length,
    detected: 0,
    sent: 0,
    failed: 0,
    skippedLogged: 0,
    skippedDisabled: 0,
    skippedOther: 0,
  };

  const seen = new Set<string>();

  for (const row of events as any[]) {
    const type = String(row.type || 'other');
    if (!['payment', 'debt', 'activation'].includes(type)) {
      result.skippedOther++;
      continue;
    }

    if (type === 'payment' && !settings?.auto?.onPayment) { result.skippedDisabled++; continue; }
    if (type === 'debt' && !settings?.auto?.onDebt) { result.skippedDisabled++; continue; }
    if (type === 'activation' && !settings?.auto?.onActivation && !settings?.auto?.onRenewal) { result.skippedDisabled++; continue; }

    const phone = normPushPhone(row.phoneNorm || row.phone);
    const externalId = String(row.externalId || row.id || '').startsWith('ext-')
      ? String(row.externalId || '')
      : `ext-${String(row.externalId || '').replace(/\D/g, '')}`;

    const sandId = Number(row.id || row.sandId || 0);
    if (!phone || !externalId || !sandId) continue;

    const eventKey = `finance:${externalId}:${sandId}:${type}`;
    if (seen.has(eventKey)) {
      result.skippedLogged++;
      continue;
    }
    seen.add(eventKey);

    const alreadyRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c
      FROM PushNotificationLog
      WHERE targetType = ? OR targetType LIKE CONCAT(?, ':%')
    `, eventKey, eventKey).catch(() => [{ c: 0 }]);

    if (Number(alreadyRows?.[0]?.c || 0) > 0) {
      result.skippedLogged++;
      continue;
    }

    const title = financeTitle(type);

    const amountValue = Number(row.amount || row.moneyIn || row.moneyOut || 0);
    const paidValue = Number(type === 'payment' ? (row.amount || row.moneyIn || 0) : (row.moneyIn || 0));
    const debtValue = Number(type === 'debt' ? (row.amount || row.moneyOut || 0) : (row.moneyOut || 0));
    const totalDebtValue = Number(row.debt ?? row.totalDebt ?? debtValue ?? 0);
    const packagePriceValue = Number(type === 'activation' ? (row.amount || row.moneyOut || 0) : (row.packagePrice || row.price || 0));
    const expireDate = row.dateTo || row.expiration || null;

    const vars = {
      name: cleanNullText(row.name || 'مشترك'),
      phone,
      pppoe: cleanNullText(row.pppoeUsername || ''),
      package: cleanNullText(row.package || ''),
      packagePrice: amountText(packagePriceValue),
      amount: amountText(amountValue),
      paid: amountText(paidValue),
      debt: amountText(debtValue),
      totalDebt: amountText(totalDebtValue),
      remaining: amountText(totalDebtValue),
      receipt: sandId,
      transactionId: sandId,
      date: enDate(expireDate),
      expireDate: enDate(expireDate),
      status: cleanNullText(row.status || ''),
      type,
    };

    let message = '';
    if (type === 'payment') {
      message = renderFinanceTemplate(settings.templates?.payment || 'تم تسجيل دفعة جديدة بقيمة {amount} د.ع.', vars);
    } else if (type === 'debt') {
      message = renderFinanceTemplate(settings.templates?.debt || 'يوجد عليك مبلغ مستحق قدره {amount} د.ع.', vars);
    } else if (type === 'activation') {
      message = renderFinanceTemplate(settings.templates?.activation || 'تم تفعيل الاشتراك بنجاح.', vars);
    }

    const channelKey = type === 'payment' ? 'payment' : type === 'debt' ? 'debt' : 'activation';
    const ch = (settings as any).channels?.[channelKey] || 'push';

    if (ch === 'off') {
      result.skippedDisabled++;
      continue;
    }

    const sentByChannel = await sendAutoByChannel(phone, title, message, eventKey, ch);
    await addSubscriberInAppNotification(phone, title, message, `finance_${type}`);

    await prisma.$executeRawUnsafe(`
      INSERT INTO PushCampaign
      (id,title,message,targetType,targetValue,sentCount,failedCount,createdById)
      VALUES (?,?,?,?,?,?,?,?)
    `, cuid(), title, message, `${eventKey}:${sentByChannel.channel}`, phone, sentByChannel.sent, sentByChannel.failed, null);

    result.detected++;
    result.sent += sentByChannel.sent;
    result.failed += sentByChannel.failed;
  }

  res.json({ ok: true, safe: true, mode: 'today-finance-events-only', result });
});

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*) AS totalDevices,
      SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS activeDevices,
      COUNT(DISTINCT phoneNorm) AS subscribers
    FROM SubscriberPushSubscription
  `);

  const campaigns = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM PushCampaign ORDER BY createdAt DESC LIMIT 30
  `);

  const waRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*) AS whatsappSessions,
      SUM(status='connected' AND active=1) AS whatsappConnected,
      COALESCE(SUM(sentToday),0) AS whatsappSentToday,
      COALESCE(SUM(failedToday),0) AS whatsappFailedToday
    FROM WhatsappSession
  `).catch(() => [{ whatsappSessions: 0, whatsappConnected: 0, whatsappSentToday: 0, whatsappFailedToday: 0 }]);

  res.json(jsonSafe({ stats: { ...(rows[0] || {}), ...(waRows[0] || {}) }, campaigns }));
});


async function getCampaignVarsByPhone(phoneRaw: any, targetType = '') {
  const phone = normPushPhone(phoneRaw);

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT phoneNorm, phone, name, pppoeUsername, package, debt, expiration
    FROM ExternalSubscriberCache
    WHERE phoneNorm=? OR phoneNorm=? OR phone=?
    UNION ALL
    SELECT normalizedPhone AS phoneNorm, phone, name, pppoeUsername, package, debt, expiration
    FROM SubscriberCache
    WHERE normalizedPhone=? OR phone=?
    LIMIT 1
  `, phone, '0' + phone, phone, phone, phone).catch(() => []);

  const r = rows[0] || {};
  const debt = Number(r.debt || 0);

  return {
    name: cleanNullText(r.name || 'مشترك'),
    phone: String(r.phone || phoneRaw || ''),
    pppoe: cleanNullText(r.pppoeUsername || ''),
    package: cleanNullText(r.package || ''),
    packagePrice: '',
    amount: amountText(debt),
    paid: '',
    debt: amountText(debt),
    totalDebt: amountText(debt),
    remaining: amountText(debt),
    receipt: '',
    transactionId: '',
    date: enDate(r.expiration || null),
    expireDate: enDate(r.expiration || null),
    days: '',
    status: '',
    type: targetType,
  };
}

async function renderCampaignMessage(message: string, phone: any, targetType = '') {
  const vars = await getCampaignVarsByPhone(phone, targetType);
  return renderFinanceTemplate(message, vars);
}



type CampaignJobState = {
  id: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
  title: string;
  message: string;
  channel: string;
  targetType: string;
  targetValue: string;
  total: number;
  processed: number;
  sent: number;
  failed: number;
  pushSent: number;
  pushFailed: number;
  whatsappSent: number;
  whatsappFailed: number;
  currentPhone?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const campaignJobsStore = new Map<string, CampaignJobState>();

function createCampaignJob(data: Partial<CampaignJobState>) {
  const now = new Date().toISOString();
  const job: CampaignJobState = {
    id: cuid(),
    status: 'running',
    title: '',
    message: '',
    channel: 'push',
    targetType: 'all',
    targetValue: '',
    total: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    pushSent: 0,
    pushFailed: 0,
    whatsappSent: 0,
    whatsappFailed: 0,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  campaignJobsStore.set(job.id, job);
  return job;
}

function updateCampaignJob(id: string, patch: Partial<CampaignJobState>) {
  const cur = campaignJobsStore.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  campaignJobsStore.set(id, next);
  return next;
}

async function waitIfCampaignPaused(jobId: string) {
  while (campaignJobsStore.get(jobId)?.status === 'paused') {
    await sleep(1000);
  }
}

export const campaignJobs = asyncHandler(async (_req: Request, res: Response) => {
  const jobs = Array.from(campaignJobsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  res.json(jsonSafe({ ok: true, jobs }));
});

export const campaignJob = asyncHandler(async (req: Request, res: Response) => {
  const job = campaignJobsStore.get(String(req.params.id || ''));
  if (!job) return res.status(404).json({ error: 'Campaign job not found' });
  res.json(jsonSafe({ ok: true, job }));
});

export const cancelCampaignJob = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const job = campaignJobsStore.get(id);
  if (!job) return res.status(404).json({ error: 'Campaign job not found' });
  updateCampaignJob(id, { status: 'cancelled' });
  res.json(jsonSafe({ ok: true, job: campaignJobsStore.get(id) }));
});

export const pauseCampaignJob = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const job = campaignJobsStore.get(id);
  if (!job) return res.status(404).json({ error: 'Campaign job not found' });
  if (job.status === 'running') updateCampaignJob(id, { status: 'paused' });
  res.json(jsonSafe({ ok: true, job: campaignJobsStore.get(id) }));
});

export const resumeCampaignJob = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const job = campaignJobsStore.get(id);
  if (!job) return res.status(404).json({ error: 'Campaign job not found' });
  if (job.status === 'paused') updateCampaignJob(id, { status: 'running' });
  res.json(jsonSafe({ ok: true, job: campaignJobsStore.get(id) }));
});


export const send = asyncHandler(async (req: Request, res: Response) => {
  const title = String(req.body?.title || 'إشعار من البرق');
  const message = String(req.body?.message || '').trim();
  const targetType = String(req.body?.targetType || 'all');
  const targetValue = String(req.body?.targetValue || '');
  const url = String(req.body?.url || '/my');
  const channel = String(req.body?.channel || 'push');
  const twilioTemplateId = String(req.body?.twilioTemplateId || '').trim();
  const twilioVariablesText = String(req.body?.twilioVariablesText || '').trim();
  const createdById = adminUserId(req);

  if (!message && channel !== 'twilio_template') return res.status(400).json({ error: 'message required' });
  if (channel === 'twilio_template' && !twilioTemplateId) return res.status(400).json({ error: 'twilio template required' });
  if (channel === 'twilio_template' && targetType === 'all') return res.status(400).json({ error: 'Twilio Template all disabled for safety' });

  function parseTwilioVarsText(text: string) {
    const out: any = {};
    String(text || '').split(/\n|,/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
      const i = line.indexOf('=');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  const usePush = channel === 'push' || channel === 'both' || channel === 'all';
  const useWhatsapp = channel === 'whatsapp' || channel === 'both' || channel === 'all';
  const useTwilioTemplate = channel === 'twilio_template';

  const pushTargets = usePush ? await getTargets(targetType, targetValue) : [];
  const whatsappPhones = (useWhatsapp || useTwilioTemplate) ? await getWhatsappPhones(targetType, targetValue) : [];

  const job = createCampaignJob({
    title,
    message,
    channel,
    targetType,
    targetValue,
    total: Number(pushTargets.length || 0) + Number(whatsappPhones.length || 0),
  });

  res.json({ ok: true, background: true, jobId: job.id, job: jsonSafe(job) });

  setImmediate(async () => {
    let pushSent = 0;
    let pushFailed = 0;
    let whatsappSent = 0;
    let whatsappFailed = 0;

    try {
      if (usePush) {
        for (const row of pushTargets) {
          const cur = campaignJobsStore.get(job.id);
          if (cur?.status === 'cancelled') break;
          await waitIfCampaignPaused(job.id);

          const phone = row.phoneNorm || row.phone || '';
          updateCampaignJob(job.id, { currentPhone: String(phone) });

          const renderedMessage = await renderCampaignMessage(message, phone, targetType || 'manual');

          const payload = {
            title,
            body: renderedMessage,
            icon: '/icons/apple-touch-icon.png',
            badge: '/icons/apple-touch-icon.png',
            url,
            tag: 'albarq-manual-' + Date.now(),
          };

          const ok = await sendOne(row, payload, targetType || 'manual');
          if (ok) {
            pushSent++;
            await logPush(row, payload, `${targetType}:push`, 'sent', '');
          } else {
            pushFailed++;
          }

          updateCampaignJob(job.id, {
            processed: pushSent + pushFailed + whatsappSent + whatsappFailed,
            sent: pushSent + whatsappSent,
            failed: pushFailed + whatsappFailed,
            pushSent,
            pushFailed,
            whatsappSent,
            whatsappFailed,
          });
        }
      }

      if (useWhatsapp || useTwilioTemplate) {
        for (const phone of whatsappPhones) {
          const cur = campaignJobsStore.get(job.id);
          if (cur?.status === 'cancelled') break;
          await waitIfCampaignPaused(job.id);

          updateCampaignJob(job.id, { currentPhone: String(phone) });

          if (useTwilioTemplate) {
            const setting = await getTwilioSettingForPush();
            const client = Twilio(setting.accountSid!, setting.authToken!);
            const sysVars = await getSubscriberVarsForTwilio(phone);
            const rawVars = parseTwilioVarsText(twilioVariablesText);
            const renderedVariables = Object.fromEntries(
              Object.entries(rawVars || {}).map(([k, v]) => [k, renderSystemVars(v, sysVars)])
            );

            try {
              console.log('[twilio send to]', asTwilioWhatsapp(phone));
              const msg = await client.messages.create({
                ...(setting.messagingServiceSid ? { messagingServiceSid: setting.messagingServiceSid } : { from: asTwilioWhatsapp(setting.whatsappFrom) }),
                to: asTwilioWhatsapp(phone),
                contentSid: twilioTemplateId,
                contentVariables: (() => {
                  const pkey = String(phone || '').replace(/\D/g, '').slice(-10);
                  const pv = req.body?.previewContentVariablesByPhone?.[pkey];
                  const finalVars = pv && Object.keys(pv).length ? pv : (renderedVariables || {});
                  console.log('[twilio contentVariables]', JSON.stringify(finalVars));
                  return JSON.stringify(finalVars);
                })(),
              } as any);

              console.log('[twilio sent sid]', msg.sid, msg.status);
              whatsappSent++;
              await prisma.pushNotificationLog.create({
                data: {
                  phone,
                  title: 'Twilio Template',
                  message: `contentSid=${twilioTemplateId}; sid=${msg.sid}`,
                  targetType: `${targetType}:twilio_template`,
                  status: msg.status || 'queued',
                  error: null,
                } as any,
              }).catch(() => null);
            } catch (e: any) {
              whatsappFailed++;
              await prisma.pushNotificationLog.create({
                data: {
                  phone,
                  title: 'Twilio Template',
                  message: `contentSid=${twilioTemplateId}`,
                  targetType: `${targetType}:twilio_template`,
                  status: 'failed',
                  error: e?.message || String(e),
                } as any,
              }).catch(() => null);
            }
          } else {
            const renderedMessage = await renderCampaignMessage(message, phone, targetType || 'manual');
            const r = await sendWhatsappToPhones([phone], `${title}\n\n${renderedMessage}`);

            whatsappSent += Number(r.sent || 0);
            whatsappFailed += Number(r.failed || 0);
          }

          updateCampaignJob(job.id, {
            processed: pushSent + pushFailed + whatsappSent + whatsappFailed,
            sent: pushSent + whatsappSent,
            failed: pushFailed + whatsappFailed,
            pushSent,
            pushFailed,
            whatsappSent,
            whatsappFailed,
          });
        }
      }

      const cur = campaignJobsStore.get(job.id);
      const finalStatus = cur?.status === 'cancelled' ? 'cancelled' : 'done';

      await prisma.pushCampaign.create({
    data: {
      id: `pc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          title,
          message,
          targetType: `${targetType}:${channel}`,
          targetValue,
          sentCount: Number(pushSent || 0) + Number(whatsappSent || 0),
          failedCount: Number(pushFailed || 0) + Number(whatsappFailed || 0),
          createdById,
        } as any,
      }).catch(() => null);

      updateCampaignJob(job.id, {
        status: finalStatus,
        processed: pushSent + pushFailed + whatsappSent + whatsappFailed,
        sent: pushSent + whatsappSent,
        failed: pushFailed + whatsappFailed,
        pushSent,
        pushFailed,
        whatsappSent,
        whatsappFailed,
        currentPhone: '',
      });
    } catch (e: any) {
      updateCampaignJob(job.id, {
        status: 'failed',
        error: e?.message || String(e),
      });
    }
  });
});



const defaultNotificationSettings = {
  auto: {
    enabled: true,
    onActivation: true,
    onRenewal: true,
    onPayment: true,
    onDebt: true,
    onTicketCreated: true,
    onTicketReply: true,
    onTicketStatus: true,
    onTicketClosed: true
  },
  expiry: {
    beforeDays: [7, 3, 1],
    afterDays: [1, 3]
  },
  debt: {
    enabled: true,
    minAmount: 1000,
    repeatDays: 7
  },
  channels: {
    activation: 'push',
    renewal: 'push',
    payment: 'push',
    debt: 'push',
    expiryBefore: 'push',
    expired: 'push',
    ticketCreated: 'push',
    ticketReply: 'push',
    ticketStatus: 'push',
    ticketClosed: 'push'
  },
  templates: {
    activation: 'تم تفعيل اشتراكك بنجاح.',
    renewal: 'تم تجديد اشتراكك بنجاح.',
    payment: 'تم تسجيل دفعة جديدة بقيمة {amount} د.ع.',
    debt: 'يوجد عليك مبلغ مستحق قدره {amount} د.ع.',
    expireBefore: 'اشتراكك سينتهي بعد {days} يوم.',
    expired: 'اشتراكك منتهي، يرجى التجديد لتجنب توقف الخدمة.',
    ticketCreated: 'تم إنشاء تذكرتك وسيتم متابعتها من الفريق.',
    ticketReply: 'يوجد رد جديد على تذكرتك.',
    ticketStatus: 'تم تحديث حالة التذكرة إلى: {status}.',
    general: 'لديك إشعار جديد من البرق الرقمي.'
  }
};

async function getNotificationSettingsObject() {
  const row = await prisma.setting.findUnique({ where: { key: 'notification_settings' } }).catch(() => null);
  if (!row?.value) return defaultNotificationSettings;

  const v: any = row.value;
  return {
    ...defaultNotificationSettings,
    ...v,
    auto: { ...defaultNotificationSettings.auto, ...(v.auto || {}) },
    expiry: { ...defaultNotificationSettings.expiry, ...(v.expiry || {}) },
    debt: { ...defaultNotificationSettings.debt, ...(v.debt || {}) },
    channels: { ...(defaultNotificationSettings as any).channels, ...(v.channels || {}) },
    templates: { ...defaultNotificationSettings.templates, ...(v.templates || {}) },
  };
}

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await getNotificationSettingsObject());
});

export const saveSettings = asyncHandler(async (req: Request, res: Response) => {
  const current = await getNotificationSettingsObject();
  const next = {
    ...current,
    ...(req.body || {}),
    auto: { ...current.auto, ...(req.body?.auto || {}) },
    expiry: { ...current.expiry, ...(req.body?.expiry || {}) },
    debt: { ...current.debt, ...(req.body?.debt || {}) },
    channels: { ...(current as any).channels, ...(req.body?.channels || {}) },
    templates: { ...current.templates, ...(req.body?.templates || {}) },
  };

  await prisma.setting.upsert({
    where: { key: 'notification_settings' },
    update: { value: next as any },
    create: { key: 'notification_settings', value: next as any },
  });

  res.json(next);
});


export const logs = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const type = String(req.query.type || '').trim();

  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    where.push('(phone LIKE ? OR title LIKE ? OR message LIKE ? OR targetType LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (status && status !== 'all') {
    where.push('status=?');
    params.push(status);
  }

  if (type && type !== 'all') {
    where.push('targetType LIKE ?');
    params.push(`%${type}%`);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM PushNotificationLog
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY createdAt DESC
    LIMIT 300
  `, ...params);

  const summaryRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*) AS total,
      SUM(status='sent') AS sent,
      SUM(status='failed') AS failed,
      SUM(targetType LIKE '%payment%') AS payments,
      SUM(targetType LIKE '%debt%') AS debts,
      SUM(targetType LIKE '%activation%') AS activations,
      SUM(targetType LIKE '%expiry%' OR targetType LIKE '%expired%') AS expiry
    FROM PushNotificationLog
  `);

  res.json(jsonSafe({
    summary: summaryRows[0] || {},
    rows,
  }));
});


function normPushPhone(v: any) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('964')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return n;
}

export const subscribers = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const channel = String(req.query.channel || 'push');
  const includeAll = channel === 'whatsapp' || channel === 'twilio_template' || channel === 'both' || channel === 'all';

  const devices = await prisma.subscriberPushSubscription.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      phone: true,
      phoneNorm: true,
      active: true,
      createdAt: true,
    },
  });

  const externalAccounts = await prisma.externalSubscriberCache.findMany({
    take: 50000,
    select: {
      phoneNorm: true,
      phone: true,
      name: true,
      debt: true,
      package: true,
      expiration: true,
    } as any,
  }).catch(() => []);

  const localAccounts = await prisma.subscriberCache.findMany({
    take: 50000,
    select: {
      normalizedPhone: true,
      phone: true,
      name: true,
      debt: true,
      package: true,
      expiration: true,
    } as any,
  }).catch(() => []);


  let liveAccounts: any[] = [];
  let useCacheAccounts = true;

  if (includeAll) {
    try {
      liveAccounts = q
        ? await searchExternalSubscribers(q || '')
        : await listExternalSubscribersForCache(50000);

      if (q) {
        liveAccounts = liveAccounts.filter((x: any) =>
          String(x.phone || '').toLowerCase().includes(q) ||
          String((x as any).phoneNorm || '').toLowerCase().includes(q) ||
          String(x.name || '').toLowerCase().includes(q) ||
          String(x.pppoeUsername || '').toLowerCase().includes(q)
        );
      }

      useCacheAccounts = liveAccounts.length === 0;
    } catch (e) {
      liveAccounts = [];
      useCacheAccounts = true;
    }
  }

  const map = new Map<string, any>();

  function ensure(phoneRaw: any) {
    const phoneNorm = normPushPhone(phoneRaw);
    if (!phoneNorm) return null;

    const cur = map.get(phoneNorm) || {
      phone: phoneNorm,
      phoneNorm,
      name: '',
      accountsLabel: '',
      devices: 0,
      pushEnabled: false,
      totalDebt: 0,
      accountsCount: 0,
      createdAt: null,
      accountNames: new Set<string>(),
      accounts: [],
    };

    map.set(phoneNorm, cur);
    return cur;
  }

  for (const d of devices as any[]) {
    const cur = ensure(d.phoneNorm || d.phone);
    if (!cur) continue;

    cur.phone = d.phone || cur.phoneNorm;
    cur.devices += 1;
    cur.pushEnabled = cur.pushEnabled || !!d.active;
    if (!cur.createdAt || new Date(d.createdAt) > new Date(cur.createdAt)) cur.createdAt = d.createdAt;

    map.set(cur.phoneNorm, cur);
  }

  function addAccount(a: any, phoneRaw: any) {
    const phoneNorm = normPushPhone(phoneRaw);
    if (!phoneNorm) return;

    if (!includeAll && !map.has(phoneNorm)) return;

    const cur = ensure(phoneNorm);
    if (!cur) return;

    const cleanName = String(a.name || '').replace(/NULL/gi, '').replace(/\s+/g, ' ').trim();

    const debt = Number(a.debt || 0);
    cur.accountsCount += 1;
    cur.totalDebt += debt;
    cur.accounts.push({
      name: cleanName || 'حساب',
      debt,
      package: a.package || '',
      expiration: a.expiration || null,
    });

    if (cleanName) {
      cur.accountNames.add(cleanName);
      if (!cur.name) cur.name = cleanName;
    }

    map.set(phoneNorm, cur);
  }

  for (const a of liveAccounts as any[]) addAccount(a, a.phoneNorm || a.phone || a.normalizedPhone);

  if (!includeAll || useCacheAccounts) {
    for (const a of externalAccounts as any[]) addAccount(a, a.phoneNorm || a.phone);
    for (const a of localAccounts as any[]) addAccount(a, a.normalizedPhone || a.phone);
  }

  let rows = [...map.values()].map((x) => ({
    phone: String(x.phone || x.phoneNorm),
    phoneNorm: String(x.phoneNorm),
    name: String(x.name || x.phoneNorm || 'مشترك'),
    accountsLabel: [...x.accountNames].slice(0, 5).join('، '),
    devices: Number(x.devices || 0),
    pushEnabled: !!x.pushEnabled,
    whatsappEnabled: true,
    totalDebt: Number(x.totalDebt || 0),
    accountsCount: Number(x.accountsCount || 0),
    accounts: (x.accounts || []).map((a: any) => ({
      name: String(a.name || 'حساب'),
      debt: Number(a.debt || 0),
      package: String(a.package || ''),
      expiration: a.expiration || null,
    })),
    createdAt: x.createdAt,
  }));

  if (channel === 'push') {
    rows = rows.filter((x) => x.pushEnabled);
  }

  if (q) {
    rows = rows.filter((x) =>
      x.phone.toLowerCase().includes(q) ||
      x.phoneNorm.toLowerCase().includes(q) ||
      x.name.toLowerCase().includes(q) ||
      x.accountsLabel.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    if (channel !== 'push' && Number(b.pushEnabled) !== Number(a.pushEnabled)) return Number(b.pushEnabled) - Number(a.pushEnabled);
    if (Number(b.totalDebt || 0) !== Number(a.totalDebt || 0)) return Number(b.totalDebt || 0) - Number(a.totalDebt || 0);
    if (Number(b.accountsCount) !== Number(a.accountsCount)) return Number(b.accountsCount) - Number(a.accountsCount);
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const pickerChannel = String(req.query.channel || 'push');
  const pickerLimit = Math.max(50, Math.min(500, Number(req.query.limit || 200)));
  const pickerOffset = Math.max(0, Number(req.query.offset || 0));
  const showAllPhoneSubscribers = ['whatsapp', 'twilio_template'].includes(pickerChannel);

  const baseRows = showAllPhoneSubscribers
    ? rows.filter((x: any) => String(x.phoneNorm || x.phone || '').replace(/\D/g, '').length >= 10)
    : rows;

  const pageRows = baseRows.slice(pickerOffset, pickerOffset + pickerLimit);

  res.json({
    rows: pageRows,
    total: baseRows.length,
    offset: pickerOffset,
    limit: pickerLimit,
    nextOffset: pickerOffset + pageRows.length,
    hasMore: pickerOffset + pageRows.length < baseRows.length,
  });
});


function asTwilioWhatsapp(v: any) {
  let n = String(v || '').replace(/^whatsapp:/, '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '964' + n.slice(1);
  if (!n.startsWith('964') && n.length <= 10) n = '964' + n;
  return `whatsapp:+${n}`;
}

async function getTwilioSettingForPush() {
  const row = await prisma.twilioWhatsappSetting.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  if (!row?.enabled || !row.accountSid || !row.authToken || !row.whatsappFrom) {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }
  return row;
}

async function getStoredTwilioTemplates() {
  const row = await prisma.setting.findUnique({ where: { key: 'push_twilio_templates' } }).catch(() => null);
  const list = Array.isArray((row?.value as any)?.templates) ? (row?.value as any).templates : [];
  return list;
}

export const twilioTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const templates = await getStoredTwilioTemplates();
  res.json({ templates });
});

export const saveTwilioTemplates = asyncHandler(async (req: Request, res: Response) => {
  const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];

  const clean = templates.map((x: any) => ({
    id: String(x.id || crypto.randomUUID()),
    name: String(x.name || '').trim(),
    contentSid: String(x.contentSid || '').trim(),
    variables: Array.isArray(x.variables) ? x.variables.map((v: any) => String(v || '').trim()).filter(Boolean) : [],
  })).filter((x: any) => x.name && x.contentSid);

  await prisma.setting.upsert({
    where: { key: 'push_twilio_templates' },
    create: { key: 'push_twilio_templates', value: { templates: clean } as any },
    update: { value: { templates: clean } as any },
  });

  res.json({ ok: true, templates: clean });
});


async function getSubscriberVarsForTwilio(phone: string) {
  const n = norm(phone);
  const variants = Array.from(new Set([
    n,
    '0' + n,
    '964' + n,
    n.startsWith('964') ? n.slice(3) : n,
  ].filter(Boolean)));

  const placeholders = variants.map(() => '?').join(',');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT name, phone, pppoeUsername, package AS packageName, status, expiration, debt
    FROM SubscriberCache
    WHERE normalizedPhone IN (${placeholders}) OR phone IN (${placeholders})
    UNION ALL
    SELECT name, phone, pppoeUsername, NULL AS packageName, status, expiration, debt
    FROM ExternalSubscriberCache
    WHERE phoneNorm IN (${placeholders}) OR phone IN (${placeholders})
    LIMIT 1
  `, ...variants, ...variants, ...variants, ...variants).catch(() => []);

  const sub = rows[0] || {};
  const exp = sub.expiration ? new Date(sub.expiration) : null;
  const today = new Date();
  const days = exp ? Math.ceil((exp.getTime() - today.getTime()) / 86400000) : null;

  return {
    name: sub.name || 'مشترك',
    phone: sub.phone || phone,
    pppoe: sub.pppoeUsername || '',
    username: sub.pppoeUsername || '',
    package: sub.packageName || '',
    status: sub.status || '',
    expiration: exp ? exp.toLocaleDateString('ar-IQ') : '',
    debt: Number(sub.debt || 0).toLocaleString('en-US'),
    amount: Number(sub.debt || 0).toLocaleString('en-US'),
    balance: Number(sub.debt || 0).toLocaleString('en-US'),
    due: Number(sub.debt || 0).toLocaleString('en-US'),
    daysLeft: days === null ? '' : String(Math.max(days, 0)),
    daysExpired: days === null ? '' : String(Math.max(-days, 0)),
    today: today.toLocaleDateString('ar-IQ'),
    company: 'شركة البرق الرقمي',
    appUrl: 'user.albarq.app',
    supportPhone: '07818155590',
  };
}

function renderSystemVars(text: any, vars: Record<string, any>) {
  return String(text ?? '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    return vars[key] ?? '';
  });
}

export const sendTwilioTemplate = asyncHandler(async (req: Request, res: Response) => {
  const targetType = String(req.body?.targetType || 'phone');
  const targetValue = String(req.body?.targetValue || '');
  const contentSid = String(req.body?.contentSid || '').trim();
  const variables = req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {};

  if (!contentSid) return res.status(400).json({ error: 'CONTENT_SID_REQUIRED' });

  if (targetType === 'all') {
    return res.status(400).json({
      error: 'BULK_ALL_DISABLED',
      message: 'إرسال قوالب Twilio للكل متوقف للحماية. اختر رقم محدد أو فلتر واضح.',
    });
  }

  const phones = await getWhatsappPhones(targetType, targetValue);
  const cleanPhones = Array.from(new Set((phones || []).map(norm).filter(Boolean)));

  if (cleanPhones.length > 200) {
    return res.status(400).json({
      error: 'TOO_MANY_TARGETS',
      message: `عدد الأهداف ${cleanPhones.length}. الإرسال يحتاج فلتر أضيق.`,
    });
  }

  if (!cleanPhones.length) return res.json({ targets: 0, sent: 0, failed: 0 });

  const setting = await getTwilioSettingForPush();
  const client = Twilio(setting.accountSid!, setting.authToken!);

  let sent = 0;
  let failed = 0;

  for (const phone of cleanPhones) {
    try {
      const sysVars = await getSubscriberVarsForTwilio(phone);
      const renderedVariables = Object.fromEntries(
        Object.entries(variables || {}).map(([k, v]) => [k, renderSystemVars(v, sysVars)])
      );

      const msg = await client.messages.create({
        ...(setting.messagingServiceSid ? { messagingServiceSid: setting.messagingServiceSid } : { from: asTwilioWhatsapp(setting.whatsappFrom) }),
        to: asTwilioWhatsapp(phone),
        contentSid,
        contentVariables: (() => {
                  const pkey = String(phone || '').replace(/\D/g, '').slice(-10);
                  const pv = req.body?.previewContentVariablesByPhone?.[pkey];
                  const finalVars = pv && Object.keys(pv).length ? pv : (renderedVariables || {});
                  console.log('[twilio campaign contentVariables]', JSON.stringify(finalVars));
                  return JSON.stringify(finalVars);
                })(),
      } as any);

      sent++;

      await prisma.pushNotificationLog.create({
        data: {
          phone,
          title: 'Twilio Template',
          message: `contentSid=${contentSid}`,
          targetType: `twilio_template:${targetType}`,
          status: msg.status || 'queued',
          error: null,
        } as any,
      }).catch(() => null);
    } catch (e: any) {
      failed++;

      await prisma.pushNotificationLog.create({
        data: {
          phone,
          title: 'Twilio Template',
          message: `contentSid=${contentSid}`,
          targetType: `twilio_template:${targetType}`,
          status: 'failed',
          error: e?.message || String(e),
        } as any,
      }).catch(() => null);
    }
  }

  await prisma.pushCampaign.create({
    data: {
      id: cuid(),
      title: 'Twilio Template',
      message: contentSid,
      targetType: `twilio_template:${targetType}`,
      targetValue,
      sentCount: sent,
      failedCount: failed,
      createdById: adminUserId(req),
    } as any,
  }).catch(() => null);

  res.json({ targets: cleanPhones.length, sent, failed });
});


async function fetchTwilioApprovalStatus(auth: string, approvalFetchUrl: string) {
  if (!approvalFetchUrl) return 'unknown';

  try {
    const r = await fetch(approvalFetchUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) return 'unknown';

    const raw = JSON.stringify(d).toLowerCase();
    if (raw.includes('"status":"approved"') || raw.includes('"status": "approved"')) return 'approved';
    if (raw.includes('"status":"rejected"') || raw.includes('"status": "rejected"')) return 'rejected';
    if (raw.includes('"status":"pending"') || raw.includes('"status": "pending"')) return 'pending';

    return String(d?.status || d?.whatsapp?.status || d?.approval_requests?.whatsapp?.status || 'unknown').toLowerCase();
  } catch {
    return 'unknown';
  }
}

function extractTemplateBody(x: any) {
  return (
    x.types?.['twilio/text']?.body ||
    x.types?.['twilio/media']?.body ||
    x.types?.['twilio/quick-reply']?.body ||
    x.types?.['twilio/call-to-action']?.body ||
    x.types?.['twilio/list-picker']?.body ||
    x.types?.['whatsapp/authentication']?.body ||
    ''
  );
}

function guessVariableHint(key: string, sample: string, body: string, name: string) {
  const k = String(key || '');
  const v = String(sample || '').trim();
  const all = `${body}\n${name}\n${v}`.toLowerCase();

  if (/احمد|محمد|john|ali|name|first_name|مشترك|عميل|السيد|السيدة/.test(all) && (k === '1' || /name|مشترك|عميل/.test(all))) return 'اسم المشترك';
  if (/رصيد|balance|current|الحالي/.test(all)) return 'الرصيد الحالي';
  if (/استحقاق|debt|due|مستحق|دين/.test(all)) return 'مبلغ الاستحقاق / الدين';
  if (/انتهاء|expiration|expire|date|تاريخ/.test(all)) return 'تاريخ الانتهاء';
  if (/amount|مبلغ|دينار|iqd|payment|دفعة|تسديد/.test(all)) return 'المبلغ';
  if (/pppoe|يوزر|user|username/.test(all)) return 'يوزر الاشتراك';
  if (/code|otp|verification|كود|رمز/.test(all)) return 'رمز التحقق';
  if (/phone|mobile|رقم/.test(all)) return 'رقم الهاتف';
  if (/time|وقت|ساعة/.test(all)) return 'الوقت';
  return `متغير رقم ${k}`;
}

function extractVariables(x: any, body: string) {
  const varsObj = x.variables || {};
  const fromObj = Object.keys(varsObj);
  const fromBody = Array.from(String(body).matchAll(/\{\{([^}]+)\}\}/g)).map((m: any) => String(m[1]).trim());
  const keys = Array.from(new Set([...fromObj, ...fromBody])).filter(Boolean);

  return keys.map((key: any) => {
    const sample = String(varsObj[key] || '');
    return {
      key: String(key),
      sample,
      hint: guessVariableHint(String(key), sample, body, x.friendly_name || ''),
    };
  });
}

async function fetchTwilioContentTemplatesFromApi() {
  const setting = await getTwilioSettingForPush();
  const auth = Buffer.from(`${setting.accountSid}:${setting.authToken}`).toString('base64');

  const res = await fetch('https://content.twilio.com/v1/Content?PageSize=1000', {
    headers: { Authorization: `Basic ${auth}` },
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Twilio Content API ${res.status}`);

  const items = data.contents || data.content || [];
  const out: any[] = [];

  for (const x of items) {
    const status = await fetchTwilioApprovalStatus(auth, x.links?.approval_fetch || '');
    const body = extractTemplateBody(x);
    const variables = extractVariables(x, body);

    out.push({
      id: x.sid,
      name: x.friendly_name || x.friendlyName || x.sid,
      contentSid: x.sid,
      language: x.language || '',
      status,
      approved: status === 'approved',
      type: Object.keys(x.types || {})[0] || '',
      variables,
      body,
    });
  }

  return out;
}

export const syncTwilioTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const all = await fetchTwilioContentTemplatesFromApi();
  const approved = all.filter((x: any) => x.approved);
  const templates = approved;

  await prisma.setting.upsert({
    where: { key: 'push_twilio_templates' },
    create: { key: 'push_twilio_templates', value: { templates, syncedAt: new Date().toISOString() } as any },
    update: { value: { templates, syncedAt: new Date().toISOString() } as any },
  });

  res.json({ ok: true, total: all.length, approved: approved.length, templates, all });
});


const previewStore = new Map<string, any>();

function normPhoneForPreview(v: any) {
  return String(v || '').replace(/\D/g, '');
}

function renderPreviewText(text: any, sub: any) {
  const account = (sub.accounts && sub.accounts[0]) || {};
  const vars: any = {
    name: sub.name || account.name || 'مشترك',
    phone: sub.phoneNorm || sub.phone || '',
    pppoe: account.username || sub.username || '',
    username: account.username || sub.username || '',
    package: account.package || account.profile || '',
    status: account.status || '',
    expiration: account.expiration || '',
    expireDate: account.expiration || '',
    debt: String(sub.totalDebt || sub.debt || 0),
    totalDebt: String(sub.totalDebt || sub.debt || 0),
    amount: String(sub.amount || sub.totalDebt || sub.debt || 0),
    balance: String(sub.balance || 0),
    days: String(sub.days || sub.daysLeft || ''),
    daysLeft: String(sub.daysLeft || ''),
    daysExpired: String(sub.daysExpired || ''),
    today: new Date().toISOString().slice(0, 10),
    company: 'البرق الرقمي',
    appUrl: 'https://user.albarq.app',
    supportPhone: '07818155590',
  };

  return String(text || '').replace(/\{([^}:]+)\}/g, (_m, k) => vars[k] ?? '');
}

function parsePreviewTwilioVars(text: any, sub: any) {
  const out: any = {};

  String(text || '')
    .split(/[\n,]+/)
    .map((x: string) => x.trim())
    .filter(Boolean)
    .forEach((line: string) => {
      const p = line.indexOf('=');
      if (p < 1) return;

      const key = line.slice(0, p).trim();
      const raw = line.slice(p + 1).trim();

      if (!key) return;

      const val = renderPreviewText(raw, sub);
      out[key] = val === '' && raw.includes('{totalDebt}') ? '0' : val;
    });

  return out;
}

async function getPreviewSubscribers(req: any) {
  const body = req.body || {};
  const phones = String(body.targetValue || '')
    .split(',')
    .map((x: string) => x.trim())
    .filter(Boolean);

  const rows: any[] = [];

  async function callSubscribers(q: string) {
    const fakeReq: any = {
      ...req,
      query: {
        q,
        channel: body.channel || 'whatsapp',
      },
      next: () => {},
    };

    const fakeRes: any = {
      json(data: any) {
        if (Array.isArray(data)) rows.push(...data);
        else if (Array.isArray(data?.rows)) rows.push(...data.rows);
        else if (Array.isArray(data?.subscribers)) rows.push(...data.subscribers);
      },
      status() { return this; },
    };

    await subscribers(fakeReq, fakeRes, fakeReq.next);
  }

  if (body.targetType === 'phone' && phones.length) {
    for (const ph of phones) {
      await callSubscribers(ph);
      const clean = String(ph).replace(/\D/g, '');
      if (clean.length > 10) await callSubscribers(clean.slice(-10));
    }
  } else {
    await callSubscribers(body.targetValue || '');
  }

  return rows;
}

export async function campaignPreview(req: any, res: any) {
  try {
    const body = req.body || {};
    if (body.channel === 'twilio_template' && String(body.twilioVariablesText || '').indexOf('2=') === -1) {
      body.twilioVariablesText = '1={name}\n2={totalDebt}';
      req.body.twilioVariablesText = body.twilioVariablesText;
    }
    let rawSubs = await getPreviewSubscribers(req);
    if (Array.isArray(body.previewSubscribers) && body.previewSubscribers.length) {
      rawSubs = body.previewSubscribers;
    }

    const wanted = String(body.targetValue || '')
      .split(',')
      .map(normPhoneForPreview)
      .filter(Boolean);

    let subs = rawSubs;
    if (body.targetType === 'phone' && wanted.length) {
      const set = new Set(wanted.map((x: string) => x.slice(-10)));
      subs = rawSubs.filter((x: any) => {
        const p = normPhoneForPreview(x.phoneNorm || x.phone);
        return set.has(p.slice(-10));
      });

      if (!subs.length) {
        subs = wanted.map((phone: string) => ({
          name: 'مشترك',
          phone,
          phoneNorm: phone,
          totalDebt: 0,
          accounts: [],
        }));
      }
    }

    const seen = new Set<string>();
    const rows = [];

    for (const sub of subs) {
      const phone = normPhoneForPreview(sub.phoneNorm || sub.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const row: any = {
        name: sub.name || 'مشترك',
        phone: sub.phoneNorm || sub.phone,
        duplicate: false,
      };

      if (body.channel === 'twilio_template') {
        row.contentVariables = parsePreviewTwilioVars(body.twilioVariablesText, sub);
        row.renderedMessage = renderPreviewText(body.message, sub);
      } else {
        row.message = renderPreviewText(body.message, sub);
      }

      rows.push(row);
    }

    const previewToken = `pv_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    previewStore.set(previewToken, {
      createdAt: Date.now(),
      body: {
        ...body,
        targetType: 'phone',
        targetValue: rows.map((x: any) => x.phone).join(','),
      },
      rows,
    });

    return res.json({
      ok: true,
      previewToken,
      total: rows.length,
      rows,
    });
  } catch (e: any) {
    console.error('[campaignPreview]', e); return res.status(500).json({ ok: false, error: e?.message || 'preview failed' });
  }
}

export async function campaignConfirm(req: any, res: any) {
  try {
    const token = req.body?.previewToken;
    const item = previewStore.get(token);

    if (!item) {
      return res.status(400).json({ ok: false, error: 'Preview expired or invalid' });
    }

    previewStore.delete(token);

    req.body = item.body || {};
    req.body.usePreviewContentVariables = true;
    req.body.previewContentVariablesByPhone = Object.fromEntries(
      (item.rows || []).map((x: any) => [
        String(x.phone || '').replace(/\D/g, '').slice(-10),
        x.contentVariables || {}
      ])
    );
    req.body.previewSubscribers = (item.rows || []).map((x: any) => ({
      name: x.name,
      phone: x.phone,
      phoneNorm: x.phone,
      totalDebt: x.contentVariables?.['2'] || 0,
      accounts: [],
    }));

    console.log('[campaignConfirm preview vars]', JSON.stringify(req.body.previewContentVariablesByPhone));

    return send(req, res, req.next || (() => {}));
  } catch (e: any) {
    console.error('[campaignConfirm]', e); return res.status(500).json({ ok: false, error: e?.message || 'confirm failed' });
  }
}


export const employeeTestPush = asyncHandler(async (req: Request, res: Response) => {
  const user: any = (req as any).user || {};
  const out = await sendPushToEmployees(
    'اختبار إشعارات الأدمن',
    'إذا وصلتك هاي الرسالة فالإشعارات شغالة ✅',
    '/whatsapp-inbox',
    {
      employeeIds: user?.id ? [user.id] : [],
      type: 'admin_test',
      tag: 'admin-test-' + Date.now(),
    }
  );
  res.json({ ok: true, ...out, userId: user?.id || null });
});

export const contactHistory = asyncHandler(async (req: Request, res: Response) => {
  const phones = String(req.query.phones || '')
    .split(',')
    .map((x) => normPushPhone(x))
    .filter(Boolean);

  if (!phones.length) return res.json({ rows: [] });

  const variants = Array.from(new Set(
    phones.flatMap((p) => {
      const bare = String(p || '').replace(/^0+/, '');
      return [p, bare, '0' + bare, '964' + bare, '+964' + bare].filter(Boolean);
    })
  ));

  const rows = await prisma.pushNotificationLog.findMany({
    where: { phone: { in: variants } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  }).catch(() => []);

  const latest = new Map<string, any>();

  for (const r of rows as any[]) {
    const phone = normPushPhone(r.phone);
    if (!phone || latest.has(phone)) continue;

    const targetType = String(r.targetType || '');
    const channel =
      targetType.includes('twilio') ? 'Twilio Template' :
      targetType.includes('whatsapp') ? 'WhatsApp' :
      targetType.includes('push') ? 'Push App' :
      targetType || '—';

    const canonicalPhone = '0' + phone.replace(/^0+/, '');
    latest.set(canonicalPhone, {
      phone: canonicalPhone,
      lastSentAt: r.createdAt,
      lastTitle: r.title || '—',
      lastTemplate: targetType.includes('twilio') ? (r.title || 'Twilio Template') : (r.title || '—'),
      lastChannel: channel,
      lastStatus: r.status || '—',
      lastError: r.error || null,
    });
  }

  res.json({ rows: Array.from(latest.values()) });
});
