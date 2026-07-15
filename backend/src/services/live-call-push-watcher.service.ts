// @ts-nocheck
import { prisma } from '../config/prisma.js';
import { getAsteriskGateway } from '../asterisk/index.js';
import { sendPushToEmployees } from '../controllers/push.controller.js';

let started = false;
const sent = new Map<string, number>();

function cleanup() {
  const now = Date.now();
  for (const [k, t] of sent.entries()) {
    if (now - t > 10 * 60 * 1000) sent.delete(k);
  }
}

export function startLiveCallPushWatcher() {
  if (started) return;
  started = true;

  setInterval(async () => {
    try {
      cleanup();

      const gw = getAsteriskGateway();
      const calls = await gw.getLiveCalls();
      console.log('[live-call-push-watcher] calls', (calls || []).map((c: any) => ({
        id: c.id,
        callerNumber: c.callerNumber,
        destinationNumber: c.destinationNumber,
        direction: c.direction,
        status: c.status,
        agentExtension: c.agentExtension,
        queue: c.queue,
      })));

      const inbound = (calls || []).filter((c: any) =>
        c?.id &&
        c?.agentExtension &&
        c?.direction === 'inbound' &&
        !['ended', 'completed', 'hangup'].includes(String(c.status || ''))
      );

      if (!inbound.length) return;

      const extensions = [...new Set(inbound.map((c: any) => String(c.agentExtension)))];

      const users = await prisma.user.findMany({
        where: {
          active: true,
          agent: {
            extension: {
              number: { in: extensions },
            },
          },
        },
        select: {
          id: true,
          fullName: true,
          username: true,
          agent: {
            select: {
              extension: { select: { number: true } },
            },
          },
        },
      }).catch(() => []);

      const byExt = new Map(
        users.map((u: any) => [String(u.agent?.extension?.number || ''), u])
      );

      for (const call of inbound) {
        const ext = String(call.agentExtension || '');
        const user = byExt.get(ext);
        if (!user?.id) continue;

        const key = `${user.id}:${call.id}`;
        if (sent.has(key)) continue;
        sent.set(key, Date.now());

        const caller = call.callerName || call.subscriber?.name || call.callerNumber || 'متصل جديد';

        await sendPushToEmployees(
          'مكالمة واردة مباشرة',
          `${caller} يتصل الآن على تحويلتك`,
          `/employee/calls?call=${encodeURIComponent(String(call.id))}`,
          {
            employeeIds: [user.id],
            callId: String(call.id),
            type: 'live_call',
            tag: `live-call-${call.id}`,
          }
        );
      }
    } catch (e) {
      console.error('[live-call-push-watcher]', e?.message || e);
    }
  }, 4000);

  console.log('[live-call-push-watcher] started');
}
