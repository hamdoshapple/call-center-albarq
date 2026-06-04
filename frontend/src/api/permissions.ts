import type { ModuleKey, PermissionAction, Role, RolePermissions } from '@/types';
import { mock } from './client';
import { store } from './store';

export function getPermissions() {
  return mock(() => JSON.parse(JSON.stringify(store.permissions)) as RolePermissions);
}

export function setPermission(
  role: Role,
  module: ModuleKey,
  actions: PermissionAction[]
) {
  store.permissions[role][module] = actions;
  return mock(() => JSON.parse(JSON.stringify(store.permissions)) as RolePermissions);
}

export function togglePermission(
  role: Role,
  module: ModuleKey,
  action: PermissionAction,
  enabled: boolean
) {
  const current = new Set(store.permissions[role][module]);
  if (enabled) current.add(action);
  else current.delete(action);
  // Removing "view" removes the whole module access.
  if (!current.has('view')) current.clear();
  store.permissions[role][module] = Array.from(current);
  return mock(() => JSON.parse(JSON.stringify(store.permissions)) as RolePermissions);
}
