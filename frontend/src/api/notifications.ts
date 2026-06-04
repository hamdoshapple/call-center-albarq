const API_BASE = '/api';
const token = () => localStorage.getItem('cc_token') || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text() || `API error ${res.status}`);
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export function listNotifications() {
  return api<any[]>('/notifications');
}

export async function markRead(id: string) {
  await api(`/notifications/${id}/read`, { method: 'PUT' });
  return listNotifications();
}

export async function markAllRead() {
  const rows = await listNotifications();
  await Promise.all(rows.filter((n: any) => !n.read).map((n: any) => markRead(String(n.id))));
  return listNotifications();
}
