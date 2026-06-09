import type { ModuleKey, PermissionAction, Role, RolePermissions } from '@/types';

export const MODULES: ModuleKey[] = [
  'dashboard',
  'live_calls',
  'agents',
  'departments',
  'queues',
  'ivr',
  'voice_prompts',
  'call_transfer',
  'call_logs',
  'recordings',
  'subscribers',
  'tg400',
  'asterisk',
  'vpn',
  'reports',
  'permissions',
  'company_settings',
];

export const ALL_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];

const full = (): Record<ModuleKey, PermissionAction[]> =>
  MODULES.reduce(
    (acc, m) => {
      acc[m] = [...ALL_ACTIONS];
      return acc;
    },
    {} as Record<ModuleKey, PermissionAction[]>
  );

const viewOnly = (modules: ModuleKey[]): Record<ModuleKey, PermissionAction[]> =>
  MODULES.reduce(
    (acc, m) => {
      acc[m] = modules.includes(m) ? ['view'] : [];
      return acc;
    },
    {} as Record<ModuleKey, PermissionAction[]>
  );

const withCrud = (
  base: Record<ModuleKey, PermissionAction[]>,
  crud: Partial<Record<ModuleKey, PermissionAction[]>>
): Record<ModuleKey, PermissionAction[]> => ({ ...base, ...crud });

export const DEFAULT_PERMISSIONS: RolePermissions = {
  super_admin: full(),
  manager: withCrud(
    viewOnly([
      'dashboard',
      'live_calls',
      'agents',
      'departments',
      'queues',
      'ivr',
      'voice_prompts',
      'call_transfer',
      'call_logs',
      'recordings',
      'subscribers',
      'tg400',
      'asterisk',
  'vpn',
      'reports',
    ]),
    {
      agents: ['view', 'create', 'edit', 'delete'],
      departments: ['view', 'create', 'edit', 'delete'],
      queues: ['view', 'create', 'edit', 'delete'],
      ivr: ['view', 'create', 'edit'],
      voice_prompts: ['view', 'create', 'edit', 'delete'],
      reports: ['view', 'create'],
    }
  ),
  supervisor: withCrud(
    viewOnly([
      'dashboard',
      'live_calls',
      'agents',
      'queues',
      'call_transfer',
      'call_logs',
      'recordings',
      'subscribers',
      'reports',
    ]),
    {
      live_calls: ['view', 'edit'],
      call_transfer: ['view', 'create'],
      agents: ['view', 'edit'],
    }
  ),
  agent: withCrud(viewOnly(['dashboard', 'live_calls', 'call_logs', 'subscribers', 'call_transfer']), {
    live_calls: ['view', 'edit'],
    call_transfer: ['view', 'create'],
  }),
  accountant: viewOnly(['dashboard', 'subscribers', 'call_logs', 'reports', 'tg400']),
  support: withCrud(viewOnly(['dashboard', 'live_calls', 'call_logs', 'subscribers', 'recordings']), {
    subscribers: ['view', 'edit'],
  }),
};

export function can(
  permissions: RolePermissions,
  role: Role,
  module: ModuleKey,
  action: PermissionAction = 'view'
): boolean {
  return permissions[role]?.[module]?.includes(action) ?? false;
}
