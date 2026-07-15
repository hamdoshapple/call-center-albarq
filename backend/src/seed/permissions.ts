export const MODULES = [
  'dashboard', 'live_calls', 'agents', 'departments', 'queues', 'ivr', 'voice_prompts',
  'call_transfer', 'call_logs', 'recordings', 'subscribers', 'tg400', 'asterisk',
  'reports', 'permissions', 'company_settings',
] as const;

export type ModuleKey = (typeof MODULES)[number];
export type Action = 'view' | 'create' | 'edit' | 'delete';

const ALL: Action[] = ['view', 'create', 'edit', 'delete'];

const full = (): Record<ModuleKey, Action[]> =>
  Object.fromEntries(MODULES.map((m) => [m, [...ALL]])) as Record<ModuleKey, Action[]>;

const viewOnly = (mods: ModuleKey[]): Record<ModuleKey, Action[]> =>
  Object.fromEntries(MODULES.map((m) => [m, mods.includes(m) ? (['view'] as Action[]) : []])) as Record<ModuleKey, Action[]>;

const merge = (base: Record<ModuleKey, Action[]>, over: Partial<Record<ModuleKey, Action[]>>) => ({ ...base, ...over });

export const ROLE_PERMISSIONS: Record<string, Record<ModuleKey, Action[]>> = {
  super_admin: full(),
  manager: merge(
    viewOnly(['dashboard', 'live_calls', 'agents', 'departments', 'queues', 'ivr', 'voice_prompts', 'call_transfer', 'call_logs', 'recordings', 'subscribers', 'tg400', 'asterisk', 'reports']),
    {
      agents: ['view', 'create', 'edit', 'delete'],
      departments: ['view', 'create', 'edit', 'delete'],
      queues: ['view', 'create', 'edit', 'delete'],
      ivr: ['view', 'create', 'edit'],
      voice_prompts: ['view', 'create', 'edit', 'delete'],
      reports: ['view', 'create'],
    }
  ),
  supervisor: merge(
    viewOnly(['dashboard', 'live_calls', 'agents', 'queues', 'call_transfer', 'call_logs', 'recordings', 'subscribers', 'reports']),
    { live_calls: ['view', 'edit'], call_transfer: ['view', 'create'], agents: ['view', 'edit'] }
  ),
  agent: merge(viewOnly(['dashboard', 'live_calls', 'call_logs', 'subscribers', 'call_transfer']), {
    live_calls: ['view', 'edit'],
    call_transfer: ['view', 'create'],
  }),
  accountant: viewOnly(['dashboard', 'subscribers', 'call_logs', 'reports', 'tg400']),
  support: merge(viewOnly(['dashboard', 'live_calls', 'call_logs', 'subscribers', 'recordings']), {
    subscribers: ['view', 'edit'],
  }),
};

export const ROLE_META: Record<string, { name: string; nameEn: string }> = {
  super_admin: { name: 'مدير عام', nameEn: 'Super Admin' },
  manager: { name: 'مدير', nameEn: 'Manager' },
  supervisor: { name: 'مشرف', nameEn: 'Supervisor' },
  agent: { name: 'موظف', nameEn: 'Agent' },
  accountant: { name: 'محاسب', nameEn: 'Accountant' },
  support: { name: 'دعم', nameEn: 'Support' },
};
