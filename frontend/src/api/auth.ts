import type { AuthSession, User } from '@/types';
import { DEMO_USERS } from '@/data/users';
import { mock, mockFail } from './client';

export async function login(username: string, password: string): Promise<AuthSession> {
  const match = DEMO_USERS.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );
  if (!match) return mockFail('INVALID_CREDENTIALS');
  const user: User = { ...match.user, lastLogin: new Date().toISOString() };
  return mock({ user, token: `demo.${match.username}.${Date.now()}` });
}

export async function me(token: string): Promise<User> {
  const username = token.split('.')[1];
  const match = DEMO_USERS.find((u) => u.username === username);
  if (!match) return mockFail('INVALID_TOKEN');
  return mock(match.user);
}

export function listDemoUsers() {
  return DEMO_USERS.map((u) => ({ username: u.username, role: u.user.role }));
}
