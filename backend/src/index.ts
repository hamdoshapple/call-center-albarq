import { refreshExternalSubscriberCache } from './services/subscriber-cache.service.js';
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


// Auto refresh external subscribers cache
const CACHE_REFRESH_EVERY_MIN = Number(process.env.SUBSCRIBERS_CACHE_REFRESH_MIN || 60);
const CACHE_REFRESH_LIMIT = Number(process.env.SUBSCRIBERS_CACHE_REFRESH_LIMIT || 50000);
let cacheRefreshRunning = false;

async function runSubscribersCacheRefresh(reason: string) {
  if (cacheRefreshRunning) return;
  cacheRefreshRunning = true;
  try {
    console.log(`[subscribers-cache] auto refresh started: ${reason}`);
    const result = await refreshExternalSubscriberCache(CACHE_REFRESH_LIMIT);
    console.log(`[subscribers-cache] auto refresh done: count=${result.count}`);
  } catch (err) {
    console.error('[subscribers-cache] auto refresh failed:', err);
  } finally {
    cacheRefreshRunning = false;
  }
}

setInterval(() => {
  void runSubscribersCacheRefresh('interval');
}, Math.max(5, CACHE_REFRESH_EVERY_MIN) * 60 * 1000);

// daily refresh around company closing time: 23:30 server time
setInterval(() => {
  const d = new Date();
  if (d.getHours() === 23 && d.getMinutes() === 30) {
    void runSubscribersCacheRefresh('daily-close');
  }
}, 60 * 1000);
