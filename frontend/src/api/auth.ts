import type { AuthSession, User } from '@/types';

const API_BASE = '/api';

function mapUser(u: any): User {
  return {
    id: u.id,
    username: u.username,
    name: u.name || u.fullName || u.username,
    email: u.email || '',
    role: u.role,
    active: true,
    lastLogin: new Date().toISOString(),
  };
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) throw new Error('INVALID_CREDENTIALS');

  const data = await res.json();

  return {
    token: data.token,
    user: mapUser(data.user),
  };
}

export async function me(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('INVALID_TOKEN');

  return mapUser(await res.json());
}

export function listDemoUsers() {
  return [
    { username: 'admin', role: 'super_admin' },
  ];
}
