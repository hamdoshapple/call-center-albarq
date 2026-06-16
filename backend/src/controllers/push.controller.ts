import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import webpush from 'web-push';
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
  };

  const row = await prisma.setting.findUnique({ where: { key: 'whatsapp_queue_settings' } }).catch(() => null);
  const v: any = row?.value || {};

  return {
    maxFailedToday: Number(v.maxFailedToday ?? defaults.maxFailedToday),
    maxFailRate: Number(v.maxFailRate ?? defaults.maxFailRate),
    windowHours: Number(v.windowHours ?? defaults.windowHours),
  };
}

async function chooseWhatsappSession() {
  const q = await getWhatsappQueueSettings();

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      s.*,
      COALESCE(x.totalWindow,0) AS totalWindow,
      COALESCE(x.failedWindow,0) AS failedWindow,
      CASE
        WHEN COALESCE(x.totalWindow,0) = 0 THEN 0
        ELSE ROUND(COALESCE(x.failedWindow,0) / x.totalWindow * 100, 2)
      END AS failRate
    FROM WhatsappSession s
    LEFT JOIN (
      SELECT
        sessionId,
        COUNT(*) AS totalWindow,
        SUM(status='failed') AS failedWindow
      FROM WhatsappMessageLog
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY sessionId
    ) x ON x.sessionId = s.sessionId
    WHERE s.active=1
      AND s.status='connected'
      AND COALESCE(s.sentToday,0) < COALESCE(s.dailyLimit,200)
    ORDER BY
      COALESCE(s.sentToday,0) ASC,
      COALESCE(s.failedToday,0) ASC,
      s.updatedAt ASC
  `, Number(q.windowHours || 24));

  if (!rows.length) return null;

  const healthy = rows.filter((s: any) =>
    Number(s.failedToday || 0) < Number(q.maxFailedToday || 10) &&
    Number(s.failRate || 0) < Number(q.maxFailRate || 15)
  );

  const pool = healthy.length ? healthy : rows;

  pool.sort((a: any, b: any) => {
    const aBad = Number(a.failedToday || 0) + Number(a.failRate || 0);
    const bBad = Number(b.failedToday || 0) + Number(b.failRate || 0);

    if (healthy.length) {
      if (Number(a.sentToday || 0) !== Number(b.sentToday || 0)) return Number(a.sentToday || 0) - Number(b.sentToday || 0);
      if (Number(a.failedToday || 0) !== Number(b.failedToday || 0)) return Number(a.failedToday || 0) - Number(b.failedToday || 0);
      return new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
    }

    return aBad - bBad;
  });

  return pool[0];
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


function waSpin(text: string) {
  return String(text || '').replace(/\{rand:([^}]+)\}/g, (_m, body) => {
    const parts = String(body || '')
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean);

    if (!parts.length) return '';
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

export async function sendWhatsappToPhones(phones: string[], message: string) {
  const session = await chooseWhatsappSession();
  if (!session) return { targets: phones.length, sent: 0, failed: phones.length, error: 'No connected WhatsApp session' };

  let sent = 0;
  let failed = 0;

  for (const phone of phones) {
    try {
      const text = waSpin(message);
      await whatsappGateway('/send', {
        sessionId: session.sessionId,
        to: phone,
        message: text,
      });

      await prisma.whatsappMessageLog.create({
        data: {
          sessionId: session.sessionId,
          to: phone,
          message: text,
          status: 'sent',
          finishedAt: new Date(),
        } as any,
      }).catch(() => null);

      await prisma.whatsappSession.update({
        where: { sessionId: session.sessionId },
        data: { sentToday: { increment: 1 } },
      }).catch(() => null);

      sent++;
    } catch (e: any) {
      failed++;
      await prisma.whatsappMessageLog.create({
        data: {
          sessionId: session.sessionId,
          to: phone,
          message,
          status: 'failed',
          error: e?.message || String(e),
          finishedAt: new Date(),
        } as any,
      }).catch(() => null);
    }
  }

  return { targets: phones.length, sent, failed, sessionId: session.sessionId };
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


export const send = asyncHandler(async (req: Request, res: Response) => {
  const title = String(req.body?.title || 'إشعار من البرق');
  const message = String(req.body?.message || '').trim();
  const targetType = String(req.body?.targetType || 'all');
  const targetValue = String(req.body?.targetValue || '');
  const url = String(req.body?.url || '/my');
  const channel = String(req.body?.channel || 'push');

  if (!message) return res.status(400).json({ error: 'message required' });

  const usePush = channel === 'push' || channel === 'both' || channel === 'all';
  const useWhatsapp = channel === 'whatsapp' || channel === 'both' || channel === 'all';

  let pushResult = { targets: 0, sent: 0, failed: 0 };
  let whatsappResult: any = { targets: 0, sent: 0, failed: 0 };

  if (usePush) {
    const targets = await getTargets(targetType, targetValue);

    let sent = 0;
    let failed = 0;

    for (const row of targets) {
      const renderedMessage = await renderCampaignMessage(message, row.phoneNorm || row.phone, targetType || 'manual');

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
        sent++;
        await logPush(row, payload, targetType || 'manual', 'sent', '');
      } else {
        failed++;
      }
    }

    pushResult = { targets: targets.length, sent, failed };
  }

  if (useWhatsapp) {
    const phones = await getWhatsappPhones(targetType, targetValue);
    let sent = 0;
    let failed = 0;

    for (const phone of phones) {
      const renderedMessage = await renderCampaignMessage(message, phone, targetType || 'manual');
      const r = await sendWhatsappToPhones([phone], `${title}\n\n${renderedMessage}`);
      sent += Number(r.sent || 0);
      failed += Number(r.failed || 0);
    }

    whatsappResult = { targets: phones.length, sent, failed };
  }

  await prisma.pushCampaign.create({
    data: {
      title,
      message,
      targetType: `${targetType}:${channel}`,
      targetValue,
      sentCount: Number(pushResult.sent || 0) + Number(whatsappResult.sent || 0),
      failedCount: Number(pushResult.failed || 0) + Number(whatsappResult.failed || 0),
      createdById: adminUserId(req),
    } as any,
  }).catch(() => null);

  res.json({
    ok: true,
    channel,
    push: pushResult,
    whatsapp: whatsappResult,
    targets: Number(pushResult.targets || 0) + Number(whatsappResult.targets || 0),
    sent: Number(pushResult.sent || 0) + Number(whatsappResult.sent || 0),
    failed: Number(pushResult.failed || 0) + Number(whatsappResult.failed || 0),
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
  const includeAll = channel === 'whatsapp' || channel === 'both' || channel === 'all';

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

  res.json(rows);
});
