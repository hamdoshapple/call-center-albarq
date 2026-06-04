import type { IVRMenu } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type IVRInput = Omit<IVRMenu, 'id' | 'createdAt'>;

export function listIVR() {
  return mock(() => [...store.ivr]);
}

export function getIVR(id: string) {
  return mock(() => store.ivr.find((m) => m.id === id) ?? null);
}

export function createIVR(input: IVRInput) {
  const menu: IVRMenu = { ...input, id: uid('ivr'), createdAt: new Date().toISOString() };
  store.ivr.unshift(menu);
  return mock(menu);
}

export function updateIVR(id: string, patch: Partial<IVRInput>) {
  const idx = store.ivr.findIndex((m) => m.id === id);
  if (idx === -1) return mock(null);
  store.ivr[idx] = { ...store.ivr[idx], ...patch };
  return mock(store.ivr[idx]);
}

export function deleteIVR(id: string) {
  store.ivr = store.ivr.filter((m) => m.id !== id);
  return mock({ success: true });
}
