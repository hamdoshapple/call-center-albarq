import type { Subscriber } from '@/types';

const API_BASE = '/api';

function token() {
  return localStorage.getItem('cc_token') || '';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

function mapSubscriber(s: any): Subscriber {
  return {
    id: String(s.id),
    name: s.name || s.fullName || '—',
    phone: s.phone || '',
    pppoeUsername: s.pppoeUsername || '',
    status: s.status || 'active',
    package: s.package || s.packageName || '—',
    speed: s.speed || '—',
    expiration: s.expiration || new Date().toISOString(),
    debt: Number(s.debt || 0),
    lastActivation: s.lastActivation || s.createdAt || new Date().toISOString(),
    lastTicketId: s.lastTicketId || undefined,
    address: s.address || '—',
    notes: s.notes || '',
  };
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const rows = await api<any[]>('/subscribers');
  return rows.map(mapSubscriber);
}

export async function searchSubscribers(query: string): Promise<Subscriber[]> {
  const q = encodeURIComponent(query || '');
  const rows = await api<any[]>(`/subscribers?q=${q}`);
  return rows.map(mapSubscriber);
}

export async function getSubscriber(id: string): Promise<Subscriber | null> {
  const row = await api<any>(`/subscribers/${id}`);
  return row ? mapSubscriber(row) : null;
}

export async function getSubscriberByPhone(phone: string): Promise<Subscriber | null> {
  const rows = await searchSubscribers(phone);
  return rows.find((s) => s.phone === phone) ?? null;
}

export async function getSubscriberTickets(subscriberId: string) {
  return api<any[]>(`/subscribers/${subscriberId}/tickets`);
}

export async function updateSubscriber(id: string, patch: Partial<Subscriber>) {
  const row = await api<any>(`/subscribers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return mapSubscriber(row);
}

export async function createSubscriber(input: Omit<Subscriber, 'id'>) {
  const row = await api<any>('/subscribers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapSubscriber(row);
}


export async function createSubscriberTicket(
  subscriberId: string,
  input: {
    subject: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    call?: any;
  }
) {
  return api<any>(`/subscribers/${subscriberId}/tickets`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}


export async function updateSubscriberTicketStatus(
  subscriberId: string,
  ticketId: string,
  status: 'open' | 'pending' | 'resolved' | 'closed'
) {
  return api<any>(`/subscribers/${subscriberId}/tickets/${ticketId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}


export async function addSubscriberTicketComment(
  subscriberId: string,
  ticketId: string,
  body: string
) {
  return api<any>(`/subscribers/${subscriberId}/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function getSubscriberCacheStatus() {
  return api<{
    count: number;
    newestCachedAt: string | null;
    oldestCachedAt: string | null;
    enabled: boolean;
  }>('/subscribers-cache/status');
}

export async function refreshSubscriberCache(limit = 50000) {
  return api<{ count: number; refreshedAt: string }>('/subscribers-cache/refresh', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}
