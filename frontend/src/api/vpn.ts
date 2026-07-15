const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json() as Promise<T>;
}

export type VpnUser = {
  id: string;
  username: string;
  password: string;
  service: 'l2tp' | 'pptp' | 'sstp' | 'wireguard';
  remote_ip: string;
  local_ip: string;
  routed_ranges: string;
  expires_at: string | null;
  enabled: boolean;
  online: boolean;
  last_login: string | null;
  notes: string;
};

export function list(params?: { q?: string }) {
  const qs = params?.q ? `?q=${encodeURIComponent(params.q)}` : '';
  return api<VpnUser[]>(`/vpn${qs}`);
}

export function create(payload: Partial<VpnUser>) {
  return api<VpnUser>('/vpn', { method: 'POST', body: JSON.stringify(payload) });
}

export function update(id: string, payload: Partial<VpnUser>) {
  return api<VpnUser>(`/vpn/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function toggle(id: string) {
  return api<VpnUser>(`/vpn/${id}/toggle`, { method: 'POST' });
}

export function extend(id: string, months = 1) {
  return api<VpnUser>(`/vpn/${id}/extend`, { method: 'POST', body: JSON.stringify({ months }) });
}

export function remove(id: string) {
  return api<{ ok: boolean }>(`/vpn/${id}`, { method: 'DELETE' });
}

export function generateChap() {
  return api<{ ok: boolean; users: number; path: string }>('/vpn/generate-chap', { method: 'POST' });
}

export function restartService() {
  return api<{ ok: boolean }>('/vpn/restart-service', { method: 'POST' });
}

export function applyRoutes(id: string) {
  return api<{ ok: boolean; routes: string[]; gateway: string; dev: string }>(`/vpn/${id}/apply-routes`, { method: 'POST' });
}

export function status() {
  return api<{ ip: string; routes: string }>('/vpn/status');
}
