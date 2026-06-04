import { mock } from './client';
import { store } from './store';
import { peakHours } from '@/data/dashboard';

export interface AgentPerformanceRow {
  agentId: string;
  name: string;
  extension: string;
  callsHandled: number;
  callsMissed: number;
  avgHandleTime: number;
  satisfaction: number;
  occupancy: number;
}

export interface QueuePerformanceRow {
  queueId: string;
  name: string;
  number: string;
  answered: number;
  abandoned: number;
  avgWait: number;
  serviceLevel: number;
}

export function getAgentPerformance() {
  return mock<AgentPerformanceRow[]>(() =>
    store.agents.map((a) => ({
      agentId: a.id,
      name: a.name,
      extension: a.extension,
      callsHandled: a.performance.callsHandled,
      callsMissed: a.performance.callsMissed,
      avgHandleTime: a.performance.avgHandleTime,
      satisfaction: a.performance.satisfaction,
      occupancy: a.performance.occupancy,
    }))
  );
}

export function getQueuePerformance() {
  return mock<QueuePerformanceRow[]>(() =>
    store.queues.map((q) => ({
      queueId: q.id,
      name: q.name,
      number: q.number,
      answered: q.stats.answered,
      abandoned: q.stats.abandoned,
      avgWait: q.stats.avgWait,
      serviceLevel: q.stats.serviceLevel,
    }))
  );
}

export function getPeakHoursReport() {
  return mock(() => peakHours);
}

export function getMissedCallsReport() {
  return mock(() =>
    store.callLogs
      .filter((l) => l.disposition === 'missed' || l.disposition === 'no_answer' || l.disposition === 'abandoned')
      .slice(0, 60)
  );
}

export function getCallbacksReport() {
  return mock(() => [...store.callbacks]);
}
