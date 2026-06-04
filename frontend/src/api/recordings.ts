import { mock } from './client';
import { store } from './store';

export interface RecordingFilters {
  search?: string;
  agentId?: string;
  from?: string;
  to?: string;
}

export function listRecordings(filters: RecordingFilters = {}) {
  return mock(() => {
    let rows = [...store.recordings];
    if (filters.search) rows = rows.filter((r) => r.callerNumber.includes(filters.search!.trim()));
    if (filters.agentId) rows = rows.filter((r) => r.agentId === filters.agentId);
    if (filters.from) rows = rows.filter((r) => r.recordedAt >= filters.from!);
    if (filters.to) rows = rows.filter((r) => r.recordedAt <= filters.to! + 'T23:59:59Z');
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  });
}

export function getRecording(id: string) {
  return mock(() => store.recordings.find((r) => r.id === id) ?? null);
}

export function deleteRecording(id: string) {
  store.recordings = store.recordings.filter((r) => r.id !== id);
  return mock({ success: true });
}
