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
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const targetType = String(req.body?.targetType || 'all');
  const targetValue = String(req.body?.targetValue || '');
  const url = String(req.body?.url || '/my');

  if (!title || !message) {
    return res.status(400).json({ error: 'title and message required' });
  }

  const targets = await getTargets(targetType, targetValue);

  let sent = 0;
  let failed = 0;

  const payload = {
    title,
    body: message,
    icon: '/logo.svg',
    badge: '/logo.svg',
    url,
    tag: 'albarq-' + Date.now(),
  };

  for (const row of targets) {
    const ok = await sendOne(row, payload, targetType);
    if (ok) sent++;
    else failed++;
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO PushCampaign
    (id,title,message,targetType,targetValue,sentCount,failedCount,createdById)
    VALUES (?,?,?,?,?,?,?,?)
  `,
    cuid(),
    title,
    message,
    targetType,
    targetValue || null,
    sent,
    failed,
    adminUserId(req)
  );

  res.json({ ok: true, targets: targets.length, sent, failed });
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
