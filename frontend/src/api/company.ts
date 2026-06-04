import type { CompanySettings } from '@/types';
import { mock } from './client';
import { store } from './store';

export function getCompany() {
  return mock(() => ({ ...store.company }));
}

export function updateCompany(patch: Partial<CompanySettings>) {
  store.company = { ...store.company, ...patch };
  return mock({ ...store.company });
}
