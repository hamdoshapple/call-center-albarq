import { mock } from './client';
import { store } from './store';

export function listNotifications() {
  return mock(() => [...store.notifications]);
}

export function markRead(id: string) {
  const n = store.notifications.find((x) => x.id === id);
  if (n) n.read = true;
  return mock(() => [...store.notifications]);
}

export function markAllRead() {
  store.notifications.forEach((n) => (n.read = true));
  return mock(() => [...store.notifications]);
}
