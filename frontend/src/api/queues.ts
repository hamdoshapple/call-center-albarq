import type { Queue } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type QueueInput = Omit<Queue, 'id' | 'createdAt' | 'stats'> & { stats?: Queue['stats'] };

const emptyStats = () => ({ waiting: 0, answered: 0, abandoned: 0, avgWait: 0, serviceLevel: 100 });

export function listQueues() {
  return mock(() => [...store.queues]);
}

export function createQueue(input: QueueInput) {
  const queue: Queue = {
    ...input,
    id: uid('q'),
    stats: input.stats ?? emptyStats(),
    createdAt: new Date().toISOString(),
  };
  store.queues.unshift(queue);
  return mock(queue);
}

export function updateQueue(id: string, patch: Partial<QueueInput>) {
  const idx = store.queues.findIndex((q) => q.id === id);
  if (idx === -1) return mock(null);
  store.queues[idx] = { ...store.queues[idx], ...patch };
  return mock(store.queues[idx]);
}

export function deleteQueue(id: string) {
  store.queues = store.queues.filter((q) => q.id !== id);
  return mock({ success: true });
}
