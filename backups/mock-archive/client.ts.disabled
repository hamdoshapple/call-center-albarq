import { delay } from '@/lib/utils';

/**
 * Simulated network latency for the mock API. When a real backend is wired in,
 * swap these helpers for fetch/axios calls against the REST endpoints described
 * in the backend (see /backend). The function signatures in src/api/* are
 * intentionally aligned with the REST resources so the swap is mechanical.
 */
const MIN = 120;
const MAX = 360;

export async function mock<T>(value: T | (() => T)): Promise<T> {
  await delay(MIN + Math.random() * (MAX - MIN));
  return typeof value === 'function' ? (value as () => T)() : value;
}

export async function mockFail(message: string): Promise<never> {
  await delay(MIN);
  throw new Error(message);
}
