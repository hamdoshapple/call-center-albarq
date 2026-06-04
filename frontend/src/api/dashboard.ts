import type { DashboardStats } from '@/types';
import { mock } from './client';
import { store } from './store';
import {
  callsByDepartment,
  dailySeries,
  monthlySeries,
  peakHours,
  weeklySeries,
} from '@/data/dashboard';

export function getDashboardStats() {
  return mock<DashboardStats>(() => {
    const live = store.liveCalls;
    const active = live.filter((c) => c.status === 'active').length;
    const waiting = live.filter((c) => c.status === 'waiting' || c.status === 'ringing').length;
    const today = store.callLogs.filter(
      (l) => new Date(l.startedAt).toDateString() === new Date().toDateString()
    );
    const answered = store.callLogs.filter((l) => l.disposition === 'answered');
    const missed = store.callLogs.filter(
      (l) => l.disposition === 'missed' || l.disposition === 'no_answer' || l.disposition === 'abandoned'
    );
    const onlineAgents = store.agents.filter((a) => a.status === 'online').length;
    const busyAgents = store.agents.filter((a) => a.status === 'busy').length;
    const avgWait = Math.round(
      store.queues.reduce((s, q) => s + q.stats.avgWait, 0) / Math.max(1, store.queues.length)
    );
    const totalTalk = answered.reduce((s, l) => s + l.talkTimeSec, 0);
    return {
      callsToday: 525,
      activeCalls: active,
      answeredCalls: answered.length,
      missedCalls: missed.length,
      waitingCalls: waiting,
      onlineAgents,
      busyAgents,
      avgWaitTime: avgWait,
      avgCallDuration: Math.round(totalTalk / Math.max(1, answered.length)),
      serviceLevel: 84,
      answerRate: Math.round((answered.length / Math.max(1, today.length || store.callLogs.length)) * 100),
    };
  });
}

export function getCallSeries(range: 'daily' | 'weekly' | 'monthly') {
  return mock(() => {
    if (range === 'weekly') return weeklySeries;
    if (range === 'monthly') return monthlySeries;
    return dailySeries;
  });
}

export function getCallsByDepartment() {
  return mock(() => callsByDepartment);
}

export function getPeakHours() {
  return mock(() => peakHours);
}
