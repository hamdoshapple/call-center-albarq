import { mock } from './client';
import { store } from './store';

export function listCallbacks() {
  return mock(() => [...store.callbacks]);
}
