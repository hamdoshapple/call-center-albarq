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
