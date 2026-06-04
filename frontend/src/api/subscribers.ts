import type { Subscriber } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export function listSubscribers() {
  return mock(() => [...store.subscribers]);
}

export function searchSubscribers(query: string) {
  return mock(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...store.subscribers];
    return store.subscribers.filter(
      (s) =>
        s.phone.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.pppoeUsername.toLowerCase().includes(q)
    );
  });
}

export function getSubscriber(id: string) {
  return mock(() => store.subscribers.find((s) => s.id === id) ?? null);
}

export function getSubscriberByPhone(phone: string) {
  return mock(() => store.subscribers.find((s) => s.phone === phone) ?? null);
}

export function getSubscriberTickets(subscriberId: string) {
  return mock(() => store.tickets.filter((t) => t.subscriberId === subscriberId));
}

export function updateSubscriber(id: string, patch: Partial<Subscriber>) {
  const idx = store.subscribers.findIndex((s) => s.id === id);
  if (idx === -1) return mock(null);
  store.subscribers[idx] = { ...store.subscribers[idx], ...patch };
  return mock(store.subscribers[idx]);
}

export function createSubscriber(input: Omit<Subscriber, 'id'>) {
  const sub: Subscriber = { ...input, id: uid('s') };
  store.subscribers.unshift(sub);
  return mock(sub);
}
