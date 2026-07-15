import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env.js';
import { verifyToken } from '../utils/jwt.js';
import { getAsteriskGateway } from '../asterisk/index.js';
import { prisma } from '../config/prisma.js';

/**
 * Sets up Socket.IO and bridges Asterisk gateway events to connected clients.
 * Channels: 'call:new', 'call:update', 'call:end', 'agent:update'.
 * Clients authenticate by passing the JWT in handshake.auth.token.
 */
export function setupSockets(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: env.corsOrigin, methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing auth token'));
    try {
      const payload = verifyToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('connected', { ok: true, mode: env.asterisk.mode });
    socket.on('disconnect', () => {
      /* no-op */
    });
  });

  // Bridge gateway → socket clients.
  const gw = getAsteriskGateway();
  gw.on('call:new', (c) => io.emit('call:new', c));
  gw.on('call:update', (c) => io.emit('call:update', c));
  gw.on('call:end', async (c) => {
    io.emit('call:end', c);

    try {
      const ext = c.agentExtension
        ? await prisma.extension.findUnique({
            where: { number: String(c.agentExtension) },
            include: { agent: true },
          })
        : null;

      await prisma.call.upsert({
        where: { uniqueId: String(c.uniqueId) },
        update: {
          callerNumber: String(c.callerNumber || 'unknown'),
          destinationNumber: String(c.destinationNumber || 'unknown'),
          direction: c.direction || 'inbound',
          status: 'ended',
          disposition: 'answered',
          agentId: ext?.agent?.id ?? null,
          endedAt: new Date(),
          durationSec: Number(c.durationSec || 0),
          talkTimeSec: Number(c.durationSec || 0),
        },
        create: {
          uniqueId: String(c.uniqueId),
          callerNumber: String(c.callerNumber || 'unknown'),
          destinationNumber: String(c.destinationNumber || 'unknown'),
          direction: c.direction || 'inbound',
          status: 'ended',
          disposition: 'answered',
          agentId: ext?.agent?.id ?? null,
          startedAt: c.startedAt ? new Date(c.startedAt) : new Date(),
          endedAt: new Date(),
          durationSec: Number(c.durationSec || 0),
          talkTimeSec: Number(c.durationSec || 0),
          waitTimeSec: 0,
        },
      });
    } catch (err) {
      console.error('[call:end db save] failed:', err);
    }
  });
  gw.on('agent:update', (a) => io.emit('agent:update', a));

  return io;
}
