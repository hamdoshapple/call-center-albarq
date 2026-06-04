import type { Department } from '@/types';
import { uid } from '@/lib/utils';
import { mock } from './client';
import { store } from './store';

export type DepartmentInput = Omit<Department, 'id' | 'createdAt'>;

export function listDepartments() {
  return mock(() => [...store.departments]);
}

export function createDepartment(input: DepartmentInput) {
  const dept: Department = { ...input, id: uid('d'), createdAt: new Date().toISOString() };
  store.departments.unshift(dept);
  return mock(dept);
}

export function updateDepartment(id: string, patch: Partial<DepartmentInput>) {
  const idx = store.departments.findIndex((d) => d.id === id);
  if (idx === -1) return mock(null);
  store.departments[idx] = { ...store.departments[idx], ...patch };
  return mock(store.departments[idx]);
}

export function deleteDepartment(id: string) {
  store.departments = store.departments.filter((d) => d.id !== id);
  return mock({ success: true });
}
