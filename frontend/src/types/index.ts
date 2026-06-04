// ===== Roles & Permissions =====
export type Role = 'super_admin' | 'manager' | 'supervisor' | 'agent' | 'accountant' | 'support';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type ModuleKey =
  | 'dashboard'
  | 'live_calls'
  | 'agents'
  | 'departments'
  | 'queues'
  | 'ivr'
  | 'voice_prompts'
  | 'call_transfer'
  | 'call_logs'
  | 'recordings'
  | 'subscribers'
  | 'tg400'
  | 'asterisk'
  | 'reports'
  | 'permissions'
  | 'company_settings';

export type RolePermissions = Record<Role, Record<ModuleKey, PermissionAction[]>>;

// ===== Auth / Users =====
export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  department?: string;
  active: boolean;
  lastLogin?: string;
}

export interface AuthSession {
  user: User;
  token: string;
}

// ===== Agents =====
export type AgentStatus = 'online' | 'offline' | 'busy' | 'paused';

export interface Agent {
  id: string;
  name: string;
  extension: string;
  sipUsername: string;
  sipPassword: string;
  email: string;
  departmentId: string;
  status: AgentStatus;
  queues: string[]; // queue ids
  workingHours: { from: string; to: string; days: number[] };
  avatar?: string;
  performance: AgentPerformance;
  createdAt: string;
}

export interface AgentPerformance {
  callsHandled: number;
  callsMissed: number;
  avgHandleTime: number; // seconds
  totalTalkTime: number; // seconds
  satisfaction: number; // 0-100
  occupancy: number; // 0-100
}

// ===== Departments =====
export interface Department {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  color: string;
  agentIds: string[];
  createdAt: string;
}

// ===== Queues =====
export type RingStrategy = 'ringall' | 'linear' | 'leastrecent' | 'roundrobin';
export type MissedCallBehavior = 'voicemail' | 'callback' | 'overflow' | 'hangup';

export interface Queue {
  id: string;
  name: string;
  number: string;
  strategy: RingStrategy;
  maxWaitTime: number; // seconds
  musicOnHold: string;
  announcement: string;
  missedBehavior: MissedCallBehavior;
  agentIds: string[];
  departmentId?: string;
  stats: QueueStats;
  createdAt: string;
}

export interface QueueStats {
  waiting: number;
  answered: number;
  abandoned: number;
  avgWait: number;
  serviceLevel: number; // 0-100
}

// ===== IVR =====
export type IVRDestinationType = 'queue' | 'department' | 'agent' | 'ivr' | 'hangup' | 'voicemail' | 'external';

export interface IVROption {
  id: string;
  key: string; // '0'-'9', '*', '#'
  label: string;
  destinationType: IVRDestinationType;
  destinationId?: string;
  destinationValue?: string;
}

export interface IVRMenu {
  id: string;
  name: string;
  description: string;
  greetingPromptId?: string;
  options: IVROption[];
  timeout: number; // seconds
  timeoutDestination: string;
  invalidDestination: string;
  repeatOnInvalid: boolean;
  maxRepeats: number;
  active: boolean;
  createdAt: string;
}

// ===== Voice Prompts =====
export type PromptCategory = 'welcome' | 'waiting' | 'closed_hours' | 'busy' | 'ivr' | 'announcement' | 'other';

export interface VoicePrompt {
  id: string;
  name: string;
  category: PromptCategory;
  fileName: string;
  url: string;
  duration: number; // seconds
  language: string;
  sizeKb: number;
  uploadedAt: string;
}

// ===== Calls =====
export type CallStatus = 'ringing' | 'waiting' | 'active' | 'ended' | 'missed' | 'failed';
export type CallDirection = 'inbound' | 'outbound' | 'internal';
export type CallDisposition = 'answered' | 'missed' | 'busy' | 'failed' | 'no_answer' | 'abandoned';

export interface LiveCall {
  id: string;
  callerNumber: string;
  callerName?: string;
  simLineId: string;
  queueId?: string;
  agentId?: string;
  status: CallStatus;
  direction: CallDirection;
  startedAt: string;
  answeredAt?: string;
  durationSec: number;
  onHold: boolean;
  subscriberId?: string;
  subscriber?: Subscriber;
  note?: string;
}

export interface CallLog {
  id: string;
  callerNumber: string;
  destinationNumber: string;
  direction: CallDirection;
  disposition: CallDisposition;
  agentId?: string;
  queueId?: string;
  simLineId?: string;
  startedAt: string;
  answeredAt?: string;
  endedAt: string;
  durationSec: number;
  talkTimeSec: number;
  waitTimeSec: number;
  recordingId?: string;
  note?: string;
  subscriberId?: string;
}

export interface CallEvent {
  id: string;
  callId: string;
  type: 'created' | 'ringing' | 'answered' | 'hold' | 'unhold' | 'transfer' | 'note' | 'hangup';
  timestamp: string;
  detail: string;
  actor?: string;
}

// ===== Recordings =====
export interface Recording {
  id: string;
  callId: string;
  callerNumber: string;
  agentId?: string;
  fileName: string;
  url: string;
  durationSec: number;
  sizeKb: number;
  recordedAt: string;
}

// ===== Subscribers =====
export type SubscriberStatus = 'active' | 'expired' | 'suspended' | 'disabled';

export interface Subscriber {
  id: string;
  name: string;
  phone: string;
  pppoeUsername: string;
  status: SubscriberStatus;
  package: string;
  speed: string;
  expiration: string;
  debt: number;
  lastActivation: string;
  lastTicketId?: string;
  address: string;
  notes?: string;
}

// ===== TG400 / GSM Lines =====
export type LineStatus = 'active' | 'inactive' | 'no_sim' | 'error';

export interface TG400Line {
  id: string;
  slot: number;
  number: string;
  carrier: string;
  status: LineStatus;
  signal: number; // 0-100
  purpose: string;
  inboundRoute: string;
  outboundRoute: string;
  usage: { calls: number; minutes: number; cost: number };
  balance: number;
}

// ===== Asterisk Settings =====
export interface AsteriskSettings {
  serverIp: string;
  sipPort: number;
  rtpStart: number;
  rtpEnd: number;
  amiHost: string;
  amiPort: number;
  amiUser: string;
  ariHost: string;
  ariPort: number;
  ariUser: string;
  trunkName: string;
  trunkHost: string;
  extensionStart: number;
  extensionEnd: number;
  recordingPath: string;
  codecs: string[];
}

// ===== Tickets / Notes / Callbacks =====
export interface Ticket {
  id: string;
  subscriberId: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  agentId?: string;
}

export interface Callback {
  id: string;
  callerNumber: string;
  subscriberId?: string;
  requestedAt: string;
  scheduledFor: string;
  status: 'pending' | 'completed' | 'failed';
  agentId?: string;
  reason: string;
}

export interface Note {
  id: string;
  refType: 'call' | 'subscriber' | 'agent';
  refId: string;
  body: string;
  author: string;
  createdAt: string;
}

// ===== Transfers =====
export type TransferType = 'blind' | 'attended';
export type TransferTarget = 'agent' | 'queue' | 'external';

export interface TransferRecord {
  id: string;
  callId: string;
  callerNumber: string;
  fromAgentId?: string;
  type: TransferType;
  targetType: TransferTarget;
  targetId: string;
  targetLabel: string;
  status: 'completed' | 'failed' | 'in_progress';
  timestamp: string;
}

// ===== Notifications =====
export interface AppNotification {
  id: string;
  type: 'call' | 'system' | 'agent' | 'subscriber' | 'alert';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ===== Company Settings =====
export interface CompanySettings {
  name: string;
  nameEn: string;
  logo: string;
  themeColor: string;
  language: 'ar' | 'en';
  businessHours: { from: string; to: string; days: number[] };
  closedMessage: string;
  holidays: { date: string; name: string }[];
}

// ===== Dashboard =====
export interface DashboardStats {
  callsToday: number;
  activeCalls: number;
  answeredCalls: number;
  missedCalls: number;
  waitingCalls: number;
  onlineAgents: number;
  busyAgents: number;
  avgWaitTime: number;
  avgCallDuration: number;
  serviceLevel: number;
  answerRate: number;
}

export interface TimeSeriesPoint {
  label: string;
  calls: number;
  answered: number;
  missed: number;
}

// ===== Generic =====
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
