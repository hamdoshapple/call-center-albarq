import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import webpush from 'web-push';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getExternalSubscriberPayments } from '../services/external-subscriber.service.js';

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
  const d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) return '0' + d.slice(3);
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

async function chooseWhatsappSession() {
  const rows = await prisma.whatsappSession.findMany({
    where: { active: true, status: 'connected' },
    orderBy: [{ sentToday: 'asc' }, { updatedAt: 'asc' }],
  }).catch(() => []);
  return rows.find((x: any) => Number(x.sentToday || 0) < Number(x.dailyLimit || 200)) || null;
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

async function sendWhatsappToPhones(phones: string[], message: string) {
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
  const cleanPhones = Array.from(new Set((phones || []).map(norm).filter(Boolean)));
  if (!cleanPhones.length) return { targets: 0, sent: 0, failed: 0 };

  const placeholders = cleanPhones.map(() => '?').join(',');
  const targets = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM SubscriberPushSubscription
    WHERE active=1 AND phoneNorm IN (${placeholders})
  `, ...cleanPhones);

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

      const r = await sendPushToPhones([phone], title, message, '/my');

      sent += r.sent;
      failed += r.failed;

      await prisma.$executeRawUnsafe(`
        INSERT INTO PushCampaign
        (id,title,message,targetType,targetValue,sentCount,failedCount,createdById)
        VALUES (?,?,?,?,?,?,?,?)
      `, cuid(), title, message, targetType, phone, r.sent, r.failed, null);
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
    const targets = await getTargets('debt', String(settings.debt.minAmount || 1000));
    let sent = 0;
    let failed = 0;

    for (const row of targets) {
      const ok = await sendOne(row, {
        title: 'يوجد مبلغ مستحق',
        body: settings.templates?.debt || 'يوجد عليك مبلغ مستحق.',
        icon: '/icons/apple-touch-icon.png',
        badge: '/icons/apple-touch-icon.png',
        url: '/my',
        tag: `albarq-debt-${Date.now()}`,
      }, 'auto_debt');

      if (ok) sent++;
      else failed++;
    }

    results.push({ targetType: 'debt', targets: targets.length, sent, failed });
  }

  res.json({ ok: true, results });
});


function amountText(v: any) {
  return Number(v || 0).toLocaleString('en-US');
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

  const subscribers = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      ps.phoneNorm,
      MAX(ps.phone) AS phone,
      ec.externalId,
      MAX(ec.name) AS name,
      MAX(ps.updatedAt) AS lastPushAt
    FROM SubscriberPushSubscription ps
    JOIN ExternalSubscriberCache ec ON ec.phoneNorm = ps.phoneNorm
    WHERE ps.active=1
    GROUP BY ps.phoneNorm, ec.externalId
    ORDER BY lastPushAt DESC
    LIMIT 500
  `);

  const result = {
    subscribers: subscribers.length,
    liveOk: 0,
    liveFailed: 0,
    cacheFallback: 0,
    scanned: 0,
    detected: 0,
    sent: 0,
    failed: 0,
    skippedLogged: 0,
    skippedDisabled: 0,
  };

  async function saveCache(externalId: string, row: any) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO ExternalSubscriberPaymentCache
      (id, externalId, sandId, date, amount, type, title, notes, package, dateFrom, dateTo, moneyIn, moneyOut, cachedAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))
      ON DUPLICATE KEY UPDATE
        date=VALUES(date),
        amount=VALUES(amount),
        type=VALUES(type),
        title=VALUES(title),
        notes=VALUES(notes),
        package=VALUES(package),
        dateFrom=VALUES(dateFrom),
        dateTo=VALUES(dateTo),
        moneyIn=VALUES(moneyIn),
        moneyOut=VALUES(moneyOut),
        updatedAt=NOW(3)
    `,
      cuid(),
      externalId,
      Number(row.sandId || row.id || 0),
      row.date ? new Date(row.date) : null,
      Number(row.amount || 0),
      String(row.type || 'other'),
      String(row.title || ''),
      row.notes || null,
      row.package || null,
      row.dateFrom ? new Date(row.dateFrom) : null,
      row.dateTo ? new Date(row.dateTo) : null,
      Number(row.moneyIn || 0),
      Number(row.moneyOut || 0),
    );
  }

  async function processRow(row: any, phone: string, source: string) {
    const type = String(row.type || 'other');
    if (!['payment', 'debt', 'activation'].includes(type)) return;

    if (type === 'payment' && !settings?.auto?.onPayment) { result.skippedDisabled++; return; }
    if (type === 'debt' && !settings?.auto?.onDebt) { result.skippedDisabled++; return; }
    if (type === 'activation' && !settings?.auto?.onActivation && !settings?.auto?.onRenewal) { result.skippedDisabled++; return; }

    const sandId = Number(row.sandId || row.id || 0);
    if (!sandId) return;

    const eventKey = `finance:${row.externalId}:${sandId}:${type}`;

    const already = await prisma.pushNotificationLog.count({
      where: { targetType: eventKey } as any,
    }).catch(() => 0);

    if (already > 0) {
      result.skippedLogged++;
      return;
    }

    const title = financeTitle(type);
    let message = '';

    if (type === 'payment') {
      message = String(settings.templates?.payment || 'تم تسجيل دفعة جديدة بقيمة {amount} د.ع.')
        .replace('{amount}', amountText(row.amount || row.moneyIn || 0));
    } else if (type === 'debt') {
      message = String(settings.templates?.debt || 'يوجد عليك مبلغ مستحق قدره {amount} د.ع.')
        .replace('{amount}', amountText(row.amount || row.moneyOut || 0));
    } else if (type === 'activation') {
      message = String(settings.templates?.activation || 'تم تفعيل اشتراكك بنجاح.');
    }

    const pushed = await sendPushToPhones([phone], title, message, '/my');

    await prisma.pushNotificationLog.create({
      data: {
        phone,
        title,
        message,
        targetType: eventKey,
        status: pushed.sent > 0 ? 'sent' : 'failed',
        error: pushed.failed > 0 ? `send failed / source=${source}` : null,
      } as any,
    }).catch(() => null);

    await addSubscriberInAppNotification(phone, title, message, `finance_${type}`);

    await prisma.$executeRawUnsafe(`
      INSERT INTO PushCampaign
      (id,title,message,targetType,targetValue,sentCount,failedCount,createdById)
      VALUES (?,?,?,?,?,?,?,?)
    `, cuid(), title, message, eventKey, phone, pushed.sent, pushed.failed, null);

    result.detected++;
    result.sent += pushed.sent;
    result.failed += pushed.failed;
  }

  for (const sub of subscribers) {
    const phone = String(sub.phoneNorm || sub.phone || '').trim();
    const externalId = String(sub.externalId || '').trim();
    if (!phone || !externalId) continue;

    let rows: any[] = [];
    let source = 'live';

    try {
      rows = await getExternalSubscriberPayments(externalId, 30);
      rows = rows.map((r: any) => ({ ...r, externalId }));
      result.liveOk++;

      for (const r of rows) {
        await saveCache(externalId, r).catch(() => null);
      }
    } catch {
      result.liveFailed++;
      source = 'cache';
      result.cacheFallback++;

      rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT *
        FROM ExternalSubscriberPaymentCache
        WHERE externalId=?
          AND type IN ('payment','debt','activation')
          AND date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY date DESC
        LIMIT 30
      `, externalId);
    }

    result.scanned += rows.length;

    for (const row of rows) {
      await processRow(row, phone, source);
    }
  }

  res.json({ ok: true, mode: 'live-first-cache-fallback', result });
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

  res.json(jsonSafe({ stats: rows[0] || {}, campaigns }));
});

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

    const payload = {
      title,
      body: message,
      icon: '/icons/apple-touch-icon.png',
      badge: '/icons/apple-touch-icon.png',
      url,
      tag: 'albarq-manual-' + Date.now(),
    };

    let sent = 0;
    let failed = 0;

    for (const row of targets) {
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
    whatsappResult = await sendWhatsappToPhones(phones, `${title}\n\n${message}`);
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

  res.json({
    summary: summaryRows[0] || {},
    rows,
  });
});


function normPushPhone(v: any) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('964')) n = '0' + n.slice(3);
  if (n.length === 10 && !n.startsWith('0')) n = '0' + n;
  return n;
}

export const subscribers = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();

  const devices = await prisma.subscriberPushSubscription.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: {
      phone: true,
      phoneNorm: true,
      active: true,
      createdAt: true,
    },
  });

  const externalAccounts = await prisma.externalSubscriberCache.findMany({
    take: 5000,
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
    take: 5000,
    select: {
      normalizedPhone: true,
      phone: true,
      name: true,
      debt: true,
      package: true,
      expiration: true,
    } as any,
  }).catch(() => []);

  const map = new Map<string, any>();

  for (const d of devices as any[]) {
    const phoneNorm = normPushPhone(d.phoneNorm || d.phone);
    if (!phoneNorm) continue;

    const cur = map.get(phoneNorm) || {
      phone: d.phone || phoneNorm,
      phoneNorm,
      name: '',
      accountsLabel: '',
      devices: 0,
      pushEnabled: false,
      totalDebt: 0,
      accountsCount: 0,
      createdAt: d.createdAt,
      accountNames: new Set<string>(),
      accounts: [],
    };

    cur.devices += 1;
    cur.pushEnabled = cur.pushEnabled || !!d.active;
    if (!cur.createdAt || new Date(d.createdAt) > new Date(cur.createdAt)) cur.createdAt = d.createdAt;

    map.set(phoneNorm, cur);
  }

  function addAccount(a: any, phoneRaw: any) {
    const phoneNorm = normPushPhone(phoneRaw);
    if (!phoneNorm || !map.has(phoneNorm)) return;

    const cur = map.get(phoneNorm);
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

  for (const a of externalAccounts as any[]) addAccount(a, a.phoneNorm || a.phone);
  for (const a of localAccounts as any[]) addAccount(a, a.normalizedPhone || a.phone);

  let rows = [...map.values()].map((x) => ({
    phone: String(x.phone || x.phoneNorm),
    phoneNorm: String(x.phoneNorm),
    name: String(x.name || x.phoneNorm || 'مشترك'),
    accountsLabel: [...x.accountNames].slice(0, 5).join('، '),
    devices: Number(x.devices || 0),
    pushEnabled: !!x.pushEnabled,
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

  if (q) {
    rows = rows.filter((x) =>
      x.phone.toLowerCase().includes(q) ||
      x.phoneNorm.toLowerCase().includes(q) ||
      x.name.toLowerCase().includes(q) ||
      x.accountsLabel.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    if (Number(b.pushEnabled) !== Number(a.pushEnabled)) return Number(b.pushEnabled) - Number(a.pushEnabled);
    if (Number(b.accountsCount) !== Number(a.accountsCount)) return Number(b.accountsCount) - Number(a.accountsCount);
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  res.json(rows.slice(0, 500));
});
