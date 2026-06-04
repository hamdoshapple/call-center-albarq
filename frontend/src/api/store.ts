import type {
  Agent,
  AppNotification,
  AsteriskSettings,
  Callback,
  CallLog,
  CompanySettings,
  Department,
  IVRMenu,
  LiveCall,
  Note,
  Queue,
  Recording,
  RolePermissions,
  Subscriber,
  TG400Line,
  Ticket,
  TransferRecord,
  VoicePrompt,
} from '@/types';
import { DEFAULT_PERMISSIONS } from '@/data/permissions';
import {
  seedAgents,
  seedAsterisk,
  seedCallbacks,
  seedCompany,
  seedDepartments,
  seedIVR,
  seedLines,
  seedNotes,
  seedPrompts,
  seedQueues,
  seedSubscribers,
  seedTickets,
  seedTransfers,
} from '@/data/seed';
import { buildCallLogs, buildLiveCalls, buildRecordings } from '@/data/calls';
import { seedNotifications } from '@/data/dashboard';

const callLogs = buildCallLogs();

export interface Store {
  agents: Agent[];
  departments: Department[];
  queues: Queue[];
  lines: TG400Line[];
  subscribers: Subscriber[];
  tickets: Ticket[];
  ivr: IVRMenu[];
  prompts: VoicePrompt[];
  transfers: TransferRecord[];
  callbacks: Callback[];
  notes: Note[];
  liveCalls: LiveCall[];
  callLogs: CallLog[];
  recordings: Recording[];
  notifications: AppNotification[];
  permissions: RolePermissions;
  company: CompanySettings;
  asterisk: AsteriskSettings;
}

// Deep clone seeds so mutations never touch the original arrays.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const store: Store = {
  agents: clone(seedAgents),
  departments: clone(seedDepartments),
  queues: clone(seedQueues),
  lines: clone(seedLines),
  subscribers: clone(seedSubscribers),
  tickets: clone(seedTickets),
  ivr: clone(seedIVR),
  prompts: clone(seedPrompts),
  transfers: clone(seedTransfers),
  callbacks: clone(seedCallbacks),
  notes: clone(seedNotes),
  liveCalls: buildLiveCalls(),
  callLogs,
  recordings: buildRecordings(callLogs),
  notifications: clone(seedNotifications),
  permissions: clone(DEFAULT_PERMISSIONS),
  company: clone(seedCompany),
  asterisk: clone(seedAsterisk),
};

export function resetStore() {
  const logs = buildCallLogs();
  store.agents = clone(seedAgents);
  store.departments = clone(seedDepartments);
  store.queues = clone(seedQueues);
  store.lines = clone(seedLines);
  store.subscribers = clone(seedSubscribers);
  store.tickets = clone(seedTickets);
  store.ivr = clone(seedIVR);
  store.prompts = clone(seedPrompts);
  store.transfers = clone(seedTransfers);
  store.callbacks = clone(seedCallbacks);
  store.notes = clone(seedNotes);
  store.liveCalls = buildLiveCalls();
  store.callLogs = logs;
  store.recordings = buildRecordings(logs);
  store.notifications = clone(seedNotifications);
  store.permissions = clone(DEFAULT_PERMISSIONS);
  store.company = clone(seedCompany);
  store.asterisk = clone(seedAsterisk);
}
