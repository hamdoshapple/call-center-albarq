import type { ModuleKey, PermissionAction, Role, RolePermissions } from '@/types';

const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function getPermissions() {
  return api<RolePermissions>('/permissions');
}

export function setPermission(role: Role, module: ModuleKey, actions: PermissionAction[]) {
  return api<RolePermissions>('/permissions', {
    method: 'PUT',
    body: JSON.stringify({ role, module, actions }),
  });
}

export async function togglePermission(role: Role, module: ModuleKey, action: PermissionAction, enabled: boolean) {
  const current = await getPermissions();
  const set = new Set(current?.[role]?.[module] || []);
  if (enabled) set.add(action);
  else set.delete(action);
  if (!set.has('view')) set.clear();
  return setPermission(role, module, Array.from(set));
}
