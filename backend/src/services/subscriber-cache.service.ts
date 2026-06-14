import { prisma } from '../config/prisma.js';
import type { ExternalSubscriber } from './external-subscriber.service.js';
import { listExternalSubscribersForCache, getExternalSubscriberPayments } from './external-subscriber.service.js';

function phoneNorm(v?: string | null) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.startsWith('964') ? `0${digits.slice(3)}` : digits.slice(-11);
}

function toCacheRow(s: ExternalSubscriber) {
  return {
    externalId: s.id,
    name: s.name || '—',
    phone: s.phone || '',
    phoneNorm: phoneNorm(s.phone),
    pppoeUsername: s.pppoeUsername || null,
    status: s.status || 'active',
    package: s.package || null,
    speed: s.speed || null,
    expiration: s.expiration ? new Date(s.expiration) : null,
    debt: Number(s.debt || 0),
    lastActivation: s.lastActivation ? new Date(s.lastActivation) : null,
    address: s.address || null,
    notes: s.notes || null,
    externalSource: s.externalSource || 'mynet',
    cachedAt: new Date(),
  };
}

function fromCacheRow(s: any) {
  return {
    id: s.externalId,
    name: s.name,
    phone: s.phone,
    pppoeUsername: s.pppoeUsername || '',
    status: s.status,
    package: s.package || '—',
    speed: s.speed || '—',
    expiration: s.expiration,
    debt: Number(s.debt || 0),
    address: s.address || '—',
    notes: s.notes || '',
    lastActivation: s.lastActivation,
    externalSource: s.externalSource || 'mynet',
    cache: {
      source: 'cache',
      cachedAt: s.cachedAt,
      ageSec: Math.max(0, Math.floor((Date.now() - new Date(s.cachedAt).getTime()) / 1000)),
    },
  };
}

export async function upsertExternalSubscriberCache(rows: ExternalSubscriber[]) {
  for (const s of rows) {
    const data = toCacheRow(s);
    await prisma.externalSubscriberCache.upsert({
      where: { externalId: data.externalId },
      create: data,
      update: data,
    });
  }
  return rows.length;
}

export async function refreshExternalSubscriberCache(limit = 50000) {
  const rows = await listExternalSubscribersForCache(limit);
  const count = await upsertExternalSubscriberCache(rows);

  let paymentsCached = 0;
  for (const s of rows) {
    try {
      paymentsCached += await cacheSubscriberPayments(s.id, 50);
    } catch {}
  }

  return { count, paymentsCached, refreshedAt: new Date().toISOString() };
}

export async function searchSubscriberCache(q = '') {
  const term = String(q || '').trim();
  const compact = term.replace(/\s+/g, '');
  const phone = phoneNorm(term);

  const rows = await prisma.externalSubscriberCache.findMany({
    where: term
      ? {
          OR: [
            { phoneNorm: { contains: phone || term } },
            { phone: { contains: term } },
            { name: { contains: term } },
            { name: { contains: compact } },
            { pppoeUsername: { contains: term } },
          ],
        }
      : undefined,
    take: 50,
    orderBy: { cachedAt: 'desc' },
  });

  return rows.map(fromCacheRow);
}

export async function getCachedExternalSubscriberById(id: string) {
  const row = await prisma.externalSubscriberCache.findUnique({ where: { externalId: id } });
  return row ? fromCacheRow(row) : null;
}

export async function subscriberCacheStatus() {
  const [count, newest, oldest] = await Promise.all([
    prisma.externalSubscriberCache.count(),
    prisma.externalSubscriberCache.findFirst({ orderBy: { cachedAt: 'desc' } }),
    prisma.externalSubscriberCache.findFirst({ orderBy: { cachedAt: 'asc' } }),
  ]);

  return {
    count,
    newestCachedAt: newest?.cachedAt ?? null,
    oldestCachedAt: oldest?.cachedAt ?? null,
    enabled: process.env.EXTERNAL_MSSQL_ENABLED === 'true',
  };
}

// Compatibility aliases for older controllers
export const searchSubscribersCached = searchSubscriberCache;
export const refreshSubscriberCache = refreshExternalSubscriberCache;
export const cacheStats = subscriberCacheStatus;

export async function updateCacheSetting(_data: any) {
  return { success: true };
}


export async function cacheSubscriberPayments(externalId: string, limit = 50) {
  const rows = await getExternalSubscriberPayments(externalId, limit);

  for (const r of rows) {
    await prisma.externalSubscriberPaymentCache.upsert({
      where: {
        externalId_sandId: {
          externalId,
          sandId: r.id,
        },
      },
      create: {
        externalId,
        sandId: r.id,
        date: r.date ? new Date(r.date) : null,
        amount: Number(r.amount || 0),
        type: r.type,
        title: r.title || 'حركة حساب',
        notes: r.notes || null,
        package: r.package || null,
        dateFrom: r.dateFrom ? new Date(r.dateFrom) : null,
        dateTo: r.dateTo ? new Date(r.dateTo) : null,
        moneyIn: Number(r.moneyIn || 0),
        moneyOut: Number(r.moneyOut || 0),
        cachedAt: new Date(),
      },
      update: {
        date: r.date ? new Date(r.date) : null,
        amount: Number(r.amount || 0),
        type: r.type,
        title: r.title || 'حركة حساب',
        notes: r.notes || null,
        package: r.package || null,
        dateFrom: r.dateFrom ? new Date(r.dateFrom) : null,
        dateTo: r.dateTo ? new Date(r.dateTo) : null,
        moneyIn: Number(r.moneyIn || 0),
        moneyOut: Number(r.moneyOut || 0),
        cachedAt: new Date(),
      },
    });
  }

  return rows.length;
}

export async function getCachedSubscriberPayments(externalId: string, limit = 50) {
  const rows = await prisma.externalSubscriberPaymentCache.findMany({
    where: { externalId },
    orderBy: [{ date: 'desc' }, { sandId: 'desc' }],
    take: limit,
  });

  const mapped = rows.map((r) => ({
    id: r.sandId,
    date: r.date,
    amount: Number(r.amount || 0),
    type: r.type,
    title: r.title,
    notes: r.notes || '',
    package: r.package || '',
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
    moneyIn: Number(r.moneyIn || 0),
    moneyOut: Number(r.moneyOut || 0),
    source: 'cache',
  }));

  const payments = mapped.filter((x) => x.type === 'payment');
  const activations = mapped.filter((x) => x.type === 'activation');
  const debts = mapped.filter((x) => x.type === 'debt');

  return {
    summary: {
      totalPaid: payments.reduce((sum, x) => sum + Number(x.amount || 0), 0),
      totalActivations: activations.reduce((sum, x) => sum + Number(x.amount || 0), 0),
      totalDebtRows: debts.reduce((sum, x) => sum + Number(x.amount || 0), 0),
      paymentsCount: payments.length,
      source: 'cache',
    },
    rows: mapped,
  };
}
