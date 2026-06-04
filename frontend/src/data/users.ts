import type { User } from '@/types';

export interface DemoCredential {
  username: string;
  password: string;
  user: User;
}

export const DEMO_USERS: DemoCredential[] = [
  {
    username: 'admin',
    password: 'admin123',
    user: {
      id: 'u_admin',
      username: 'admin',
      name: 'مدير النظام',
      email: 'admin@albarq.iq',
      role: 'super_admin',
      active: true,
      lastLogin: new Date().toISOString(),
    },
  },
  {
    username: 'manager',
    password: 'admin123',
    user: {
      id: 'u_manager',
      username: 'manager',
      name: 'سيف الدين العامري',
      email: 'manager@albarq.iq',
      role: 'manager',
      department: 'الإدارة',
      active: true,
    },
  },
  {
    username: 'supervisor',
    password: 'admin123',
    user: {
      id: 'u_sup',
      username: 'supervisor',
      name: 'رغد حسين',
      email: 'supervisor@albarq.iq',
      role: 'supervisor',
      department: 'الدعم الفني',
      active: true,
    },
  },
  {
    username: 'agent',
    password: 'admin123',
    user: {
      id: 'u_agent',
      username: 'agent',
      name: 'علي محمود',
      email: 'agent@albarq.iq',
      role: 'agent',
      department: 'الدعم الفني',
      active: true,
    },
  },
  {
    username: 'accountant',
    password: 'admin123',
    user: {
      id: 'u_acc',
      username: 'accountant',
      name: 'زينب كريم',
      email: 'accountant@albarq.iq',
      role: 'accountant',
      department: 'المحاسبة',
      active: true,
    },
  },
  {
    username: 'support',
    password: 'admin123',
    user: {
      id: 'u_support',
      username: 'support',
      name: 'حسن عبد الله',
      email: 'support@albarq.iq',
      role: 'support',
      department: 'الدعم الفني',
      active: true,
    },
  },
];
