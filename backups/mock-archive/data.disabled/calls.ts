import type { CallLog, LiveCall, Recording } from '@/types';
import { seedSubscribers } from './seed';

const callerNumbers = [
  '07701112233', '07809998877', '07512345678', '07701234999', '07707654321',
  '07801122334', '07509988776', '07700556677', '07788776655', '07733221100',
  '07811223344', '07555667788', '07744556677', '07700998877', '07822334455',
];

const agentIds = ['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'a9', 'a11', 'a12'];
const queueIds = ['q_support', 'q_accounting', 'q_sales', 'q_all'];
const lineIds = ['l1', 'l2', 'l3'];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function subscriberForNumber(num: string): string | undefined {
  return seedSubscribers.find((s) => s.phone === num)?.id;
}

// ===================== Live Calls =====================
export function buildLiveCalls(): LiveCall[] {
  const now = Date.now();
  return [
    { id: 'lc1', callerNumber: '07701112233', callerName: 'أحمد عبد الكريم', simLineId: 'l1', queueId: 'q_support', agentId: 'a1', status: 'active', direction: 'inbound', startedAt: new Date(now - 184000).toISOString(), answeredAt: new Date(now - 170000).toISOString(), durationSec: 184, onHold: false, subscriberId: 's1' },
    { id: 'lc2', callerNumber: '07809998877', callerName: 'هدى صباح', simLineId: 'l3', queueId: 'q_accounting', agentId: 'a6', status: 'active', direction: 'inbound', startedAt: new Date(now - 92000).toISOString(), answeredAt: new Date(now - 80000).toISOString(), durationSec: 92, onHold: true, subscriberId: 's2' },
    { id: 'lc3', callerNumber: '07733221100', simLineId: 'l1', queueId: 'q_support', status: 'waiting', direction: 'inbound', startedAt: new Date(now - 38000).toISOString(), durationSec: 38, onHold: false },
    { id: 'lc4', callerNumber: '07512345678', callerName: 'محمد الجبوري', simLineId: 'l1', queueId: 'q_sales', agentId: 'a8', status: 'active', direction: 'inbound', startedAt: new Date(now - 245000).toISOString(), answeredAt: new Date(now - 230000).toISOString(), durationSec: 245, onHold: false, subscriberId: 's3' },
    { id: 'lc5', callerNumber: '07788776655', simLineId: 'l2', queueId: 'q_support', status: 'ringing', direction: 'inbound', startedAt: new Date(now - 6000).toISOString(), agentId: 'a2', durationSec: 6, onHold: false },
    { id: 'lc6', callerNumber: '07700556677', callerName: 'رنا عدنان', simLineId: 'l1', queueId: 'q_all', status: 'waiting', direction: 'inbound', startedAt: new Date(now - 52000).toISOString(), durationSec: 52, onHold: false, subscriberId: 's8' },
    { id: 'lc7', callerNumber: '07811223344', simLineId: 'l2', queueId: 'q_support', agentId: 'a3', status: 'active', direction: 'inbound', startedAt: new Date(now - 410000).toISOString(), answeredAt: new Date(now - 395000).toISOString(), durationSec: 410, onHold: false },
  ];
}

// ===================== Call Logs =====================
const dispositions: CallLog['disposition'][] = ['answered', 'answered', 'answered', 'missed', 'no_answer', 'busy', 'abandoned', 'failed'];
const directions: CallLog['direction'][] = ['inbound', 'inbound', 'inbound', 'outbound', 'internal'];

export function buildCallLogs(count = 160): CallLog[] {
  const logs: CallLog[] = [];
  const base = Date.now();
  for (let i = 0; i < count; i++) {
    const seed = i * 7 + 3;
    const direction = pick(directions, seed);
    const disposition = pick(dispositions, seed + 2);
    const answered = disposition === 'answered';
    const caller = pick(callerNumbers, seed);
    const startedAt = new Date(base - i * 1000 * 60 * 17 - (seed % 50) * 1000);
    const waitTimeSec = answered ? (seed % 60) + 4 : (seed % 90) + 10;
    const talkTimeSec = answered ? (seed % 600) + 45 : 0;
    const durationSec = waitTimeSec + talkTimeSec;
    const answeredAt = answered ? new Date(startedAt.getTime() + waitTimeSec * 1000) : undefined;
    const endedAt = new Date(startedAt.getTime() + durationSec * 1000);
    const agentId = answered ? pick(agentIds, seed + 1) : undefined;
    const hasRec = answered && talkTimeSec > 60 && seed % 2 === 0;
    logs.push({
      id: `cl_${i + 1}`,
      callerNumber: direction === 'outbound' ? pick(callerNumbers, seed + 5) : caller,
      destinationNumber: direction === 'outbound' ? caller : pick(['2000', '2001', '2002', '2009'], seed),
      direction,
      disposition,
      agentId,
      queueId: direction === 'inbound' ? pick(queueIds, seed) : undefined,
      simLineId: pick(lineIds, seed),
      startedAt: startedAt.toISOString(),
      answeredAt: answeredAt?.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSec,
      talkTimeSec,
      waitTimeSec,
      recordingId: hasRec ? `rec_${i + 1}` : undefined,
      note: seed % 11 === 0 ? 'تم حل المشكلة وإعادة تشغيل الراوتر.' : undefined,
      subscriberId: subscriberForNumber(caller),
    });
  }
  return logs;
}

// ===================== Recordings =====================
export function buildRecordings(logs: CallLog[]): Recording[] {
  return logs
    .filter((l) => l.recordingId)
    .map((l) => ({
      id: l.recordingId as string,
      callId: l.id,
      callerNumber: l.callerNumber,
      agentId: l.agentId,
      fileName: `${l.recordingId}_${l.callerNumber}.wav`,
      url: '',
      durationSec: l.talkTimeSec,
      sizeKb: Math.round((l.talkTimeSec * 16) / 8),
      recordedAt: l.answeredAt ?? l.startedAt,
    }));
}
