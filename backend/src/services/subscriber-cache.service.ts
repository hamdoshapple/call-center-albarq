import { prisma } from '../config/prisma.js';
import { searchExternalSubscribers, type ExternalSubscriber } from './external-subscriber.service.js';

function normalizePhone(v?: string | null) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.startsWith('964')) return `0${digits.slice(3)}`;
  if (digits.length === 10 && !digits.startsWith('0')) return `0${digits}`;
  return digits;
}

async function getSetting() {
  return prisma.dataSourceSetting.upsert({
    where: { sourceName: 'mynet' },
    update: {},
    create: {
      sourceName: 'mynet',
      enabled: true,
      cacheTtlMinutes: 30,
      fallbackToCache: true,
      manualCacheOnly: false,
    },
  });
}

function fromCacheRow(r: any): ExternalSubscriber {
  return {
    id: r.externalId,
    name: r.name,
    phone: r.phone,
    pppoeUsername: r.pppoeUsername || '',
    status: r.status,
    package: r.package || '—',
    speed: r.speed || '—',
    expiration: r.expiration,
    debt: Number(r.debt || 0),
    address: r.address || '—',
    notes: r.notes || '',
    lastActivation: r.lastActivation,
    externalSource: 'mynet',
  };
}

async function upsertCache(rows: ExternalSubscriber[]) {
  for (const s of rows) {
    await prisma.subscriberCache.upsert({
      where: { externalId: s.id },
      update: {
        name: s.name,
        phone: s.phone,
        normalizedPhone: normalizePhone(s.phone),
        pppoeUsername: s.pppoeUsername,
        status: s.status,
        package: s.package,
        speed: s.speed,
        expiration: s.expiration,
        debt: s.debt,
        lastActivation: s.lastActivation,
        address: s.address,
        notes: s.notes,
        raw: s as any,
        cachedAt: new Date(),
      },
      create: {
        externalId: s.id,
        name: s.name,
        phone: s.phone,
        normalizedPhone: normalizePhone(s.phone),
        pppoeUsername: s.pppoeUsername,
        status: s.status,
        package: s.package,
        speed: s.speed,
        expiration: s.expiration,
        debt: s.debt,
        lastActivation: s.lastActivation,
        address: s.address,
        notes: s.notes,
        raw: s as any,
        cachedAt: new Date(),
      },
    });
  }
}

export async function searchSubscribersCached(q = '') {
  const setting = await getSetting();
  const phone = normalizePhone(q);
  const now = Date.now();
  const ttlMs = Math.max(1, setting.cacheTtlMinutes) * 60_000;

  const cachedRows = await prisma.subscriberCache.findMany({
    where: phone
      ? { normalizedPhone: phone }
      : {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { pppoeUsername: { contains: q } },
          ],
        },
    orderBy: { cachedAt: 'desc' },
    take: 50,
  });

  const newest = cachedRows[0]?.cachedAt?.getTime?.() ?? 0;
  const cacheFresh = cachedRows.length > 0 && now - newest <= ttlMs;

  if (!setting.enabled || setting.manualCacheOnly || cacheFresh) {
    return {
      rows: cachedRows.map(fromCacheRow),
      source: cachedRows.length ? 'cache' : 'none',
      cacheFresh,
      warning: setting.manualCacheOnly ? 'manual_cache_only' : undefined,
    };
  }

  try {
    const liveRows = await searchExternalSubscribers(q);

    if (liveRows.length) {
      await upsertCache(liveRows);
      await prisma.dataSourceSetting.update({
        where: { sourceName: 'mynet' },
        data: { lastSyncAt: new Date(), lastError: null, lastStatus: 'online' },
      });

      return { rows: liveRows, source: 'live', cacheFresh: true };
    }

    if (setting.fallbackToCache) {
      return {
        rows: cachedRows.map(fromCacheRow),
        source: 'cache',
        cacheFresh: false,
        warning: 'live_empty_using_cache',
      };
    }

    return { rows: [], source: 'live', cacheFresh: true };
  } catch (err: any) {
    await prisma.dataSourceSetting.update({
      where: { sourceName: 'mynet' },
      data: { lastError: String(err?.message || err), lastStatus: 'offline' },
    });

    if (setting.fallbackToCache) {
      return {
        rows: cachedRows.map(fromCacheRow),
        source: 'cache',
        cacheFresh: false,
        warning: 'live_failed_using_cache',
      };
    }

    return { rows: [], source: 'error', cacheFresh: false, warning: 'live_failed_no_cache' };
  }
}

export async function refreshSubscriberCache(q = '') {
  const rows = await searchExternalSubscribers(q);
  await upsertCache(rows);
  await prisma.dataSourceSetting.update({
    where: { sourceName: 'mynet' },
    data: { lastSyncAt: new Date(), lastError: null, lastStatus: 'online' },
  });
  return rows.length;
}

export async function cacheStats() {
  const setting = await getSetting();
  const count = await prisma.subscriberCache.count();
  const last = await prisma.subscriberCache.findFirst({ orderBy: { cachedAt: 'desc' } });
  return { setting, count, lastCachedAt: last?.cachedAt ?? null };
}

export async function updateCacheSetting(data: {
  enabled?: boolean;
  cacheTtlMinutes?: number;
  fallbackToCache?: boolean;
  manualCacheOnly?: boolean;
}) {
  await getSetting();
  return prisma.dataSourceSetting.update({
    where: { sourceName: 'mynet' },
    data,
  });
}
