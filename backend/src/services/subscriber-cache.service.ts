import { prisma } from '../config/prisma.js';
import type { ExternalSubscriber } from './external-subscriber.service.js';
import { listExternalSubscribersForCache } from './external-subscriber.service.js';

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
  return { count, refreshedAt: new Date().toISOString() };
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
