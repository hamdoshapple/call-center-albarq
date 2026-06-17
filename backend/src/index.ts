import { refreshExternalSubscriberCache } from './services/subscriber-cache.service.js';
import { prisma } from './config/prisma.js';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/prisma.js';
import { getAsteriskGateway } from './asterisk/index.js';
import { setupSockets } from './sockets/index.js';

async function main() {
  await connectDb();

  const app = createApp();
  const httpServer = createServer(app);

  // Start the Asterisk gateway (mock simulator in demo mode) and wire Socket.IO.
  const gw = getAsteriskGateway();
  await gw.connect();
  setupSockets(httpServer);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Call Center Albarq API on :${env.port} (asterisk=${env.asterisk.mode}, demo=${env.demoMode})`);
    // eslint-disable-next-line no-console
    console.log(`[server] Swagger UI: http://localhost:${env.port}/api/docs`);
  });

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log('\n[server] shutting down...');
    await gw.disconnect();
    httpServer.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal', err);
  process.exit(1);
});



// Auto refresh external subscribers cache using DB settings
let cacheRefreshRunning = false;
let lastCacheRefreshAt = 0;
let lastDailyRefreshDate = '';

async function getSubscribersCacheScheduleSettings() {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'subscribersCacheIntervalMinutes',
          'subscribersCacheFinalTime',
          'subscribersCacheLimit',
        ],
      },
    },
  });

  const map = new Map(rows.map((x) => [x.key, x.value]));

  return {
    intervalMinutes: Math.max(1, Number(map.get('subscribersCacheIntervalMinutes') || process.env.SUBSCRIBERS_CACHE_REFRESH_MIN || 15)),
    finalTime: String(map.get('subscribersCacheFinalTime') || '22:00'),
    limit: Math.max(1, Number(map.get('subscribersCacheLimit') || process.env.SUBSCRIBERS_CACHE_REFRESH_LIMIT || 7000)),
  };
}

function hhmmNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ymdNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function runSubscribersCacheRefresh(reason: string, limit?: number) {
  if (cacheRefreshRunning) return;
  cacheRefreshRunning = true;

  try {
    const settings = await getSubscribersCacheScheduleSettings();
    const refreshLimit = limit || settings.limit;

    console.log(`[subscribers-cache] auto refresh started: ${reason}, limit=${refreshLimit}`);
    const result = await refreshExternalSubscriberCache(refreshLimit);
    lastCacheRefreshAt = Date.now();
    console.log(`[subscribers-cache] auto refresh done: count=${result.count}, paymentsCached=${result.paymentsCached}`);
  } catch (err) {
    console.error('[subscribers-cache] auto refresh failed:', err);
  } finally {
    cacheRefreshRunning = false;
  }
}

setInterval(() => {
  void (async () => {
    const settings = await getSubscribersCacheScheduleSettings();
    const now = Date.now();

    if (!lastCacheRefreshAt || now - lastCacheRefreshAt >= settings.intervalMinutes * 60 * 1000) {
      await runSubscribersCacheRefresh('interval', settings.limit);
    }

    const today = ymdNow();
    if (hhmmNow() === settings.finalTime && lastDailyRefreshDate !== today) {
      lastDailyRefreshDate = today;
      await runSubscribersCacheRefresh(`final-time-${settings.finalTime}`, settings.limit);
    }
  })();
}, 60 * 1000);

void runSubscribersCacheRefresh('startup');

