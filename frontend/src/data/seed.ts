import type {
  Agent,
  AsteriskSettings,
  Callback,
  CompanySettings,
  Department,
  IVRMenu,
  Note,
  Queue,
  Recording,
  Subscriber,
  TG400Line,
  Ticket,
  TransferRecord,
  VoicePrompt,
} from '@/types';

// ===================== Departments =====================
export const seedDepartments: Department[] = [
  {
    id: 'd_support',
    name: 'الدعم الفني',
    nameEn: 'Support',
    description: 'دعم المشتركين والمشاكل التقنية للإنترنت',
    color: '#0ea5e9',
    agentIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
    createdAt: '2025-01-10T08:00:00Z',
  },
  {
    id: 'd_accounting',
    name: 'المحاسبة',
    nameEn: 'Accounting',
    description: 'الفواتير والاشتراكات والتجديد',
    color: '#22c55e',
    agentIds: ['a6', 'a7'],
    createdAt: '2025-01-10T08:00:00Z',
  },
  {
    id: 'd_sales',
    name: 'المبيعات',
    nameEn: 'Sales',
    description: 'الباقات الجديدة والعروض والتركيبات',
    color: '#f59e0b',
    agentIds: ['a8', 'a9', 'a10'],
    createdAt: '2025-01-10T08:00:00Z',
  },
  {
    id: 'd_admin',
    name: 'الإدارة',
    nameEn: 'Administration',
    description: 'الإشراف العام وإدارة الفريق',
    color: '#8b5cf6',
    agentIds: ['a11', 'a12'],
    createdAt: '2025-01-10T08:00:00Z',
  },
];

// ===================== Agents =====================
const perf = (h: number, m: number, aht: number, sat: number, occ: number) => ({
  callsHandled: h,
  callsMissed: m,
  avgHandleTime: aht,
  totalTalkTime: h * aht,
  satisfaction: sat,
  occupancy: occ,
});

const wh = (days: number[] = [0, 1, 2, 3, 4]) => ({ from: '09:00', to: '17:00', days });

export const seedAgents: Agent[] = [
  { id: 'a1', name: 'علي محمود', extension: '1001', sipUsername: 'agent1001', sipPassword: 'Sip@1001x', email: 'ali@albarq.iq', departmentId: 'd_support', status: 'online', queues: ['q_support', 'q_all'], workingHours: wh(), performance: perf(142, 6, 184, 92, 78), createdAt: '2025-01-12T08:00:00Z' },
  { id: 'a2', name: 'حسن عبد الله', extension: '1002', sipUsername: 'agent1002', sipPassword: 'Sip@1002x', email: 'hasan@albarq.iq', departmentId: 'd_support', status: 'busy', queues: ['q_support', 'q_all'], workingHours: wh(), performance: perf(128, 9, 201, 88, 81), createdAt: '2025-01-12T08:00:00Z' },
  { id: 'a3', name: 'مريم جاسم', extension: '1003', sipUsername: 'agent1003', sipPassword: 'Sip@1003x', email: 'mariam@albarq.iq', departmentId: 'd_support', status: 'online', queues: ['q_support'], workingHours: wh(), performance: perf(156, 4, 169, 95, 84), createdAt: '2025-01-14T08:00:00Z' },
  { id: 'a4', name: 'يوسف ناصر', extension: '1004', sipUsername: 'agent1004', sipPassword: 'Sip@1004x', email: 'yousif@albarq.iq', departmentId: 'd_support', status: 'paused', queues: ['q_support', 'q_all'], workingHours: wh(), performance: perf(98, 12, 220, 80, 65), createdAt: '2025-02-01T08:00:00Z' },
  { id: 'a5', name: 'فاطمة علي', extension: '1005', sipUsername: 'agent1005', sipPassword: 'Sip@1005x', email: 'fatima@albarq.iq', departmentId: 'd_support', status: 'offline', queues: ['q_support'], workingHours: wh(), performance: perf(110, 7, 195, 86, 70), createdAt: '2025-02-10T08:00:00Z' },
  { id: 'a6', name: 'زينب كريم', extension: '1006', sipUsername: 'agent1006', sipPassword: 'Sip@1006x', email: 'zainab@albarq.iq', departmentId: 'd_accounting', status: 'online', queues: ['q_accounting', 'q_all'], workingHours: wh(), performance: perf(89, 3, 240, 90, 72), createdAt: '2025-02-15T08:00:00Z' },
  { id: 'a7', name: 'عمر فاروق', extension: '1007', sipUsername: 'agent1007', sipPassword: 'Sip@1007x', email: 'omar@albarq.iq', departmentId: 'd_accounting', status: 'busy', queues: ['q_accounting'], workingHours: wh(), performance: perf(76, 5, 255, 84, 68), createdAt: '2025-03-01T08:00:00Z' },
  { id: 'a8', name: 'نور الهدى', extension: '1008', sipUsername: 'agent1008', sipPassword: 'Sip@1008x', email: 'noor@albarq.iq', departmentId: 'd_sales', status: 'online', queues: ['q_sales', 'q_all'], workingHours: wh(), performance: perf(134, 8, 175, 91, 79), createdAt: '2025-03-05T08:00:00Z' },
  { id: 'a9', name: 'كرار حيدر', extension: '1009', sipUsername: 'agent1009', sipPassword: 'Sip@1009x', email: 'karar@albarq.iq', departmentId: 'd_sales', status: 'online', queues: ['q_sales'], workingHours: wh(), performance: perf(121, 6, 188, 87, 75), createdAt: '2025-03-10T08:00:00Z' },
  { id: 'a10', name: 'سارة وليد', extension: '1010', sipUsername: 'agent1010', sipPassword: 'Sip@1010x', email: 'sara@albarq.iq', departmentId: 'd_sales', status: 'paused', queues: ['q_sales', 'q_all'], workingHours: wh(), performance: perf(103, 9, 198, 83, 69), createdAt: '2025-03-20T08:00:00Z' },
  { id: 'a11', name: 'رغد حسين', extension: '1011', sipUsername: 'agent1011', sipPassword: 'Sip@1011x', email: 'raghad@albarq.iq', departmentId: 'd_admin', status: 'online', queues: ['q_all'], workingHours: wh(), performance: perf(64, 2, 210, 93, 60), createdAt: '2025-01-08T08:00:00Z' },
  { id: 'a12', name: 'سيف الدين العامري', extension: '1012', sipUsername: 'agent1012', sipPassword: 'Sip@1012x', email: 'saif@albarq.iq', departmentId: 'd_admin', status: 'busy', queues: ['q_all'], workingHours: wh([0, 1, 2, 3, 4, 6]), performance: perf(58, 1, 230, 96, 58), createdAt: '2025-01-08T08:00:00Z' },
];

// ===================== Queues =====================
export const seedQueues: Queue[] = [
  { id: 'q_support', name: 'قائمة الدعم الفني', number: '2000', strategy: 'roundrobin', maxWaitTime: 120, musicOnHold: 'default', announcement: 'announce_support', missedBehavior: 'voicemail', agentIds: ['a1', 'a2', 'a3', 'a4', 'a5'], departmentId: 'd_support', stats: { waiting: 3, answered: 184, abandoned: 12, avgWait: 38, serviceLevel: 86 }, createdAt: '2025-01-11T08:00:00Z' },
  { id: 'q_accounting', name: 'قائمة المحاسبة', number: '2001', strategy: 'linear', maxWaitTime: 90, musicOnHold: 'default', announcement: 'announce_accounting', missedBehavior: 'callback', agentIds: ['a6', 'a7'], departmentId: 'd_accounting', stats: { waiting: 1, answered: 92, abandoned: 6, avgWait: 45, serviceLevel: 82 }, createdAt: '2025-01-11T08:00:00Z' },
  { id: 'q_sales', name: 'قائمة المبيعات', number: '2002', strategy: 'leastrecent', maxWaitTime: 60, musicOnHold: 'promo', announcement: 'announce_sales', missedBehavior: 'overflow', agentIds: ['a8', 'a9', 'a10'], departmentId: 'd_sales', stats: { waiting: 0, answered: 121, abandoned: 4, avgWait: 22, serviceLevel: 91 }, createdAt: '2025-01-11T08:00:00Z' },
  { id: 'q_all', name: 'قائمة عامة (كل الموظفين)', number: '2009', strategy: 'ringall', maxWaitTime: 150, musicOnHold: 'default', announcement: 'announce_general', missedBehavior: 'voicemail', agentIds: ['a1', 'a2', 'a4', 'a6', 'a8', 'a10', 'a11', 'a12'], stats: { waiting: 2, answered: 76, abandoned: 9, avgWait: 52, serviceLevel: 78 }, createdAt: '2025-01-11T08:00:00Z' },
];

// ===================== TG400 / GSM Lines =====================
export const seedLines: TG400Line[] = [
  { id: 'l1', slot: 1, number: '07701234567', carrier: 'Zain IQ', status: 'active', signal: 86, purpose: 'الوارد الرئيسي', inboundRoute: 'IVR الرئيسي', outboundRoute: 'المبيعات', usage: { calls: 312, minutes: 1840, cost: 184000 }, balance: 52000 },
  { id: 'l2', slot: 2, number: '07809876543', carrier: 'Asiacell', status: 'active', signal: 72, purpose: 'الدعم الفني', inboundRoute: 'قائمة الدعم 2000', outboundRoute: 'الدعم', usage: { calls: 268, minutes: 1520, cost: 152000 }, balance: 38000 },
  { id: 'l3', slot: 3, number: '07512223344', carrier: 'Korek Telecom', status: 'active', signal: 64, purpose: 'المحاسبة', inboundRoute: 'قائمة المحاسبة 2001', outboundRoute: 'المحاسبة', usage: { calls: 145, minutes: 720, cost: 72000 }, balance: 21000 },
  { id: 'l4', slot: 4, number: '07700009999', carrier: 'Zain IQ', status: 'no_sim', signal: 0, purpose: 'احتياطي', inboundRoute: '-', outboundRoute: '-', usage: { calls: 0, minutes: 0, cost: 0 }, balance: 0 },
];

// ===================== Subscribers =====================
export const seedSubscribers: Subscriber[] = [
  { id: 's1', name: 'أحمد عبد الكريم', phone: '07701112233', pppoeUsername: 'ahmed_ak', status: 'active', package: 'باقة 50 ميجا', speed: '50 Mbps', expiration: '2026-07-15', debt: 0, lastActivation: '2026-05-15', lastTicketId: 't1', address: 'بغداد - الكرادة', notes: 'مشترك مميز منذ 2023' },
  { id: 's2', name: 'هدى صباح', phone: '07809998877', pppoeUsername: 'huda_s', status: 'expired', package: 'باقة 30 ميجا', speed: '30 Mbps', expiration: '2026-05-28', debt: 25000, lastActivation: '2026-04-28', lastTicketId: 't2', address: 'بغداد - المنصور' },
  { id: 's3', name: 'محمد الجبوري', phone: '07512345678', pppoeUsername: 'mohammed_j', status: 'active', package: 'باقة 100 ميجا', speed: '100 Mbps', expiration: '2026-08-02', debt: 0, lastActivation: '2026-06-02', address: 'البصرة - العشار' },
  { id: 's4', name: 'إيمان رشيد', phone: '07701234999', pppoeUsername: 'eman_r', status: 'suspended', package: 'باقة 20 ميجا', speed: '20 Mbps', expiration: '2026-06-30', debt: 15000, lastActivation: '2026-05-30', lastTicketId: 't3', address: 'أربيل - عنكاوا' },
  { id: 's5', name: 'وسام ثائر', phone: '07707654321', pppoeUsername: 'wisam_t', status: 'active', package: 'باقة 50 ميجا', speed: '50 Mbps', expiration: '2026-09-10', debt: 0, lastActivation: '2026-06-10', address: 'بغداد - زيونة' },
  { id: 's6', name: 'دعاء حميد', phone: '07801122334', pppoeUsername: 'duaa_h', status: 'active', package: 'باقة 100 ميجا', speed: '100 Mbps', expiration: '2026-07-22', debt: 0, lastActivation: '2026-05-22', address: 'النجف - حي السلام' },
  { id: 's7', name: 'باسم قاسم', phone: '07509988776', pppoeUsername: 'basim_q', status: 'disabled', package: 'باقة 30 ميجا', speed: '30 Mbps', expiration: '2026-03-15', debt: 60000, lastActivation: '2026-02-15', lastTicketId: 't4', address: 'كركوك - الواسطي' },
  { id: 's8', name: 'رنا عدنان', phone: '07700556677', pppoeUsername: 'rana_a', status: 'active', package: 'باقة 200 ميجا فايبر', speed: '200 Mbps', expiration: '2026-10-01', debt: 0, lastActivation: '2026-06-01', address: 'بغداد - اليرموك' },
];

// ===================== Tickets =====================
export const seedTickets: Ticket[] = [
  { id: 't1', subscriberId: 's1', subject: 'بطء في السرعة مساءً', status: 'resolved', priority: 'medium', createdAt: '2026-05-30T10:00:00Z', agentId: 'a1' },
  { id: 't2', subscriberId: 's2', subject: 'طلب تجديد الاشتراك', status: 'open', priority: 'high', createdAt: '2026-06-03T09:30:00Z', agentId: 'a6' },
  { id: 't3', subscriberId: 's4', subject: 'انقطاع متكرر للخدمة', status: 'pending', priority: 'urgent', createdAt: '2026-06-02T14:20:00Z', agentId: 'a2' },
  { id: 't4', subscriberId: 's7', subject: 'مديونية متراكمة', status: 'open', priority: 'high', createdAt: '2026-06-01T11:00:00Z', agentId: 'a7' },
];

// ===================== IVR Menus =====================
export const seedIVR: IVRMenu[] = [
  {
    id: 'ivr_main',
    name: 'الرد الآلي الرئيسي',
    description: 'القائمة الرئيسية التي تستقبل جميع المكالمات الواردة',
    greetingPromptId: 'vp_welcome',
    options: [
      { id: 'io1', key: '1', label: 'الدعم الفني', destinationType: 'queue', destinationId: 'q_support' },
      { id: 'io2', key: '2', label: 'المحاسبة', destinationType: 'queue', destinationId: 'q_accounting' },
      { id: 'io3', key: '3', label: 'المبيعات', destinationType: 'queue', destinationId: 'q_sales' },
      { id: 'io0', key: '0', label: 'كل الموظفين', destinationType: 'queue', destinationId: 'q_all' },
    ],
    timeout: 8,
    timeoutDestination: 'q_all',
    invalidDestination: 'ivr_main',
    repeatOnInvalid: true,
    maxRepeats: 3,
    active: true,
    createdAt: '2025-01-15T08:00:00Z',
  },
  {
    id: 'ivr_afterhours',
    name: 'الرد خارج أوقات العمل',
    description: 'يعمل بعد الساعة 5 مساءً وأيام العطل',
    greetingPromptId: 'vp_closed',
    options: [
      { id: 'iah1', key: '1', label: 'ترك رسالة صوتية', destinationType: 'voicemail', destinationValue: 'general' },
      { id: 'iah9', key: '9', label: 'طوارئ - الدعم الفني', destinationType: 'external', destinationValue: '07701234567' },
    ],
    timeout: 10,
    timeoutDestination: 'hangup',
    invalidDestination: 'ivr_afterhours',
    repeatOnInvalid: true,
    maxRepeats: 2,
    active: true,
    createdAt: '2025-01-15T08:00:00Z',
  },
];

// ===================== Voice Prompts =====================
export const seedPrompts: VoicePrompt[] = [
  { id: 'vp_welcome', name: 'رسالة الترحيب', category: 'welcome', fileName: 'welcome_ar.wav', url: '', duration: 12, language: 'ar', sizeKb: 192, uploadedAt: '2025-01-15T08:00:00Z' },
  { id: 'vp_waiting', name: 'رسالة الانتظار', category: 'waiting', fileName: 'please_wait_ar.wav', url: '', duration: 8, language: 'ar', sizeKb: 128, uploadedAt: '2025-01-15T08:00:00Z' },
  { id: 'vp_closed', name: 'خارج أوقات العمل', category: 'closed_hours', fileName: 'closed_ar.wav', url: '', duration: 15, language: 'ar', sizeKb: 240, uploadedAt: '2025-01-15T08:00:00Z' },
  { id: 'vp_busy', name: 'ازدحام الموظفين', category: 'busy', fileName: 'all_busy_ar.wav', url: '', duration: 10, language: 'ar', sizeKb: 160, uploadedAt: '2025-01-15T08:00:00Z' },
  { id: 'vp_support', name: 'إعلان قائمة الدعم', category: 'announcement', fileName: 'announce_support_ar.wav', url: '', duration: 7, language: 'ar', sizeKb: 112, uploadedAt: '2025-02-01T08:00:00Z' },
  { id: 'vp_promo', name: 'عرض الباقات', category: 'announcement', fileName: 'promo_packages_ar.wav', url: '', duration: 18, language: 'ar', sizeKb: 288, uploadedAt: '2025-03-01T08:00:00Z' },
];

// ===================== Transfers =====================
export const seedTransfers: TransferRecord[] = [
  { id: 'tr1', callId: 'c_h1', callerNumber: '07701112233', fromAgentId: 'a1', type: 'attended', targetType: 'agent', targetId: 'a3', targetLabel: 'مريم جاسم (1003)', status: 'completed', timestamp: '2026-06-04T08:32:00Z' },
  { id: 'tr2', callId: 'c_h2', callerNumber: '07809998877', fromAgentId: 'a2', type: 'blind', targetType: 'queue', targetId: 'q_accounting', targetLabel: 'قائمة المحاسبة (2001)', status: 'completed', timestamp: '2026-06-04T09:05:00Z' },
  { id: 'tr3', callId: 'c_h3', callerNumber: '07512345678', fromAgentId: 'a8', type: 'blind', targetType: 'external', targetId: 'ext', targetLabel: '07701234567', status: 'completed', timestamp: '2026-06-04T09:48:00Z' },
  { id: 'tr4', callId: 'c_h4', callerNumber: '07701234999', fromAgentId: 'a6', type: 'attended', targetType: 'agent', targetId: 'a7', targetLabel: 'عمر فاروق (1007)', status: 'failed', timestamp: '2026-06-04T10:12:00Z' },
];

// ===================== Callbacks =====================
export const seedCallbacks: Callback[] = [
  { id: 'cb1', callerNumber: '07809998877', subscriberId: 's2', requestedAt: '2026-06-04T08:00:00Z', scheduledFor: '2026-06-04T13:00:00Z', status: 'pending', reason: 'تجديد الاشتراك' },
  { id: 'cb2', callerNumber: '07701234999', subscriberId: 's4', requestedAt: '2026-06-03T16:00:00Z', scheduledFor: '2026-06-04T11:30:00Z', status: 'completed', agentId: 'a2', reason: 'متابعة انقطاع الخدمة' },
  { id: 'cb3', callerNumber: '07788776655', requestedAt: '2026-06-04T09:20:00Z', scheduledFor: '2026-06-04T15:00:00Z', status: 'pending', reason: 'استفسار عن باقة جديدة' },
];

// ===================== Notes =====================
export const seedNotes: Note[] = [
  { id: 'n1', refType: 'subscriber', refId: 's1', body: 'العميل راضٍ عن الحل، تم رفع سرعته مؤقتاً.', author: 'علي محمود', createdAt: '2026-05-30T10:30:00Z' },
  { id: 'n2', refType: 'subscriber', refId: 's4', body: 'يحتاج زيارة فني للموقع لفحص الكيبل.', author: 'حسن عبد الله', createdAt: '2026-06-02T14:40:00Z' },
];

// ===================== Settings =====================
export const seedCompany: CompanySettings = {
  name: 'مركز اتصال البرق',
  nameEn: 'Call Center Albarq',
  logo: '/logo.svg',
  themeColor: '#0ea5e9',
  language: 'ar',
  businessHours: { from: '09:00', to: '17:00', days: [0, 1, 2, 3, 4, 6] },
  closedMessage: 'نعتذر، مركز الاتصال مغلق حالياً. ساعات العمل من 9 صباحاً حتى 5 مساءً.',
  holidays: [
    { date: '2026-07-09', name: 'عيد الأضحى' },
    { date: '2026-10-03', name: 'رأس السنة الهجرية' },
  ],
};

export const seedAsterisk: AsteriskSettings = {
  serverIp: '192.168.1.50',
  sipPort: 5060,
  rtpStart: 10000,
  rtpEnd: 20000,
  amiHost: '192.168.1.50',
  amiPort: 5038,
  amiUser: 'albarq_ami',
  ariHost: '192.168.1.50',
  ariPort: 8088,
  ariUser: 'albarq_ari',
  trunkName: 'tg400-trunk',
  trunkHost: '192.168.1.60',
  extensionStart: 1001,
  extensionEnd: 1099,
  recordingPath: '/var/spool/asterisk/monitor',
  codecs: ['alaw', 'ulaw', 'g729', 'opus'],
};
