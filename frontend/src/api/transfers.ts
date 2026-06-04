import { mock } from './client';
import { store } from './store';

export function listTransfers() {
  return mock(() => [...store.transfers].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
}
