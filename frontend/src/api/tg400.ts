import type { TG400Line } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type LineInput = Omit<TG400Line, 'id'>;

export function listLines() {
  return mock(() => [...store.lines]);
}

export function createLine(input: LineInput) {
  const line: TG400Line = { ...input, id: uid('l') };
  store.lines.push(line);
  return mock(line);
}

export function updateLine(id: string, patch: Partial<LineInput>) {
  const idx = store.lines.findIndex((l) => l.id === id);
  if (idx === -1) return mock(null);
  store.lines[idx] = { ...store.lines[idx], ...patch };
  return mock(store.lines[idx]);
}

export function deleteLine(id: string) {
  store.lines = store.lines.filter((l) => l.id !== id);
  return mock({ success: true });
}
