import type { CallLog } from '@/types';
import { mock } from './client';
import { store } from './store';

export interface CallLogFilters {
  search?: string;
  agentId?: string;
  queueId?: string;
  direction?: CallLog['direction'];
  disposition?: CallLog['disposition'];
  from?: string;
  to?: string;
}

export function listCallLogs(filters: CallLogFilters = {}) {
  return mock(() => {
    let rows = [...store.callLogs];
    if (filters.search) {
      const q = filters.search.trim();
      rows = rows.filter(
        (r) => r.callerNumber.includes(q) || r.destinationNumber.includes(q)
      );
    }
    if (filters.agentId) rows = rows.filter((r) => r.agentId === filters.agentId);
    if (filters.queueId) rows = rows.filter((r) => r.queueId === filters.queueId);
    if (filters.direction) rows = rows.filter((r) => r.direction === filters.direction);
    if (filters.disposition) rows = rows.filter((r) => r.disposition === filters.disposition);
    if (filters.from) rows = rows.filter((r) => r.startedAt >= filters.from!);
    if (filters.to) rows = rows.filter((r) => r.startedAt <= filters.to! + 'T23:59:59Z');
    return rows;
  });
}

export function getCallLog(id: string) {
  return mock(() => store.callLogs.find((r) => r.id === id) ?? null);
}
