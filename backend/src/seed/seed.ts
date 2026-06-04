import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { MODULES, ROLE_META, ROLE_PERMISSIONS } from './permissions.js';

const NAMES = [
  'علي محمود', 'حسن عبد الله', 'مريم جاسم', 'يوسف ناصر', 'فاطمة علي', 'زينب كريم',
  'عمر فاروق', 'نور الهدى', 'كرار حيدر', 'سارة وليد', 'رغد حسين', 'سيف الدين العامري',
];
const CARRIERS = ['Zain', 'Asiacell', 'Korek'];
const PACKAGES = ['20 Mbps', '40 Mbps', '60 Mbps', '100 Mbps'];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

async function reset() {
  // Delete in dependency order.
  await prisma.callEvent.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.call.deleteMany();
  await prisma.callback.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.note.deleteMany();
  await prisma.queueMember.deleteMany();
  await prisma.ivrOption.deleteMany();
  await prisma.ivrMenu.deleteMany();
  await prisma.voicePrompt.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.queue.deleteMany();
  await prisma.subscriber.deleteMany();
  await prisma.tg400Line.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
}

async function seedRolesAndAdmin() {
  const roleIds: Record<string, string> = {};
  for (const key of Object.keys(ROLE_PERMISSIONS)) {
    const role = await prisma.role.create({
      data: { key, name: ROLE_META[key].name, nameEn: ROLE_META[key].nameEn },
    });
    roleIds[key] = role.id;
    await prisma.permission.createMany({
      data: MODULES.map((m) => ({ roleId: role.id, module: m, actions: ROLE_PERMISSIONS[key][m] })),
    });
  }

  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: { username: 'admin', email: 'admin@albarq.iq', passwordHash, fullName: 'مدير النظام', roleId: roleIds.super_admin },
  });
  // A couple of extra demo users for other roles (same password for demo simplicity).
  await prisma.user.create({
    data: { username: 'manager', email: 'manager@albarq.iq', passwordHash, fullName: 'مدير القسم', roleId: roleIds.manager },
  });
  await prisma.user.create({
    data: { username: 'agent', email: 'agent@albarq.iq', passwordHash, fullName: 'موظف الدعم', roleId: roleIds.agent },
  });

  return roleIds;
}

async function seedDepartments() {
  const data = [
    { name: 'الدعم الفني', nameEn: 'Support', color: '#0ea5e9', description: 'دعم المشتركين والمشاكل التقنية' },
    { name: 'المحاسبة', nameEn: 'Accounting', color: '#16a34a', description: 'الفواتير والاشتراكات' },
    { name: 'المبيعات', nameEn: 'Sales', color: '#f59e0b', description: 'العروض والباقات الجديدة' },
    { name: 'الإدارة', nameEn: 'Administration', color: '#9333ea', description: 'الإدارة العامة' },
  ];
  const out = [];
  for (const d of data) out.push(await prisma.department.create({ data: d }));
  return out;
}

async function seedQueues(depIds: string[]) {
  const data = [
    { name: 'قائمة الدعم الفني', number: '2000', strategy: 'ringall', departmentId: depIds[0] },
    { name: 'قائمة المحاسبة', number: '2001', strategy: 'leastrecent', departmentId: depIds[1] },
    { name: 'قائمة المبيعات', number: '2002', strategy: 'roundrobin', departmentId: depIds[2] },
    { name: 'قائمة عامة', number: '2009', strategy: 'linear', departmentId: depIds[3] },
  ];
  const out = [];
  for (const q of data) {
    out.push(
      await prisma.queue.create({
        data: {
          ...q,
          maxWaitTime: randInt(60, 180),
          waiting: randInt(0, 4),
          answered: randInt(80, 260),
          abandoned: randInt(3, 30),
          avgWait: randInt(15, 70),
          serviceLevel: randInt(75, 96),
        },
      })
    );
  }
  return out;
}

async function seedAgents(depIds: string[], queueIds: string[]) {
  const agents = [];
  for (let i = 0; i < NAMES.length; i++) {
    const ext = String(1001 + i);
    const depId = depIds[Math.min(depIds.length - 1, Math.floor(i / 3))];
    const agent = await prisma.agent.create({
      data: {
        name: NAMES[i],
        email: `agent${i + 1}@albarq.iq`,
        status: rand(['online', 'online', 'busy', 'paused', 'offline']),
        departmentId: depId,
        workFrom: '09:00',
        workTo: '17:00',
        workDays: [0, 1, 2, 3, 4],
        callsHandled: randInt(50, 170),
        callsMissed: randInt(2, 20),
        avgHandleTime: randInt(150, 280),
        totalTalkTime: randInt(20000, 60000),
        satisfaction: randInt(78, 98),
        occupancy: randInt(55, 92),
        extension: { create: { number: ext, sipUsername: `sip${ext}`, sipPassword: `Pass${ext}!demo` } },
      },
    });
    // Assign to the department queue + general queue.
    const assigned = new Set<string>([queueIds[Math.min(queueIds.length - 1, Math.floor(i / 3))], queueIds[3]]);
    await prisma.queueMember.createMany({ data: [...assigned].map((queueId) => ({ queueId, agentId: agent.id })) });
    agents.push(agent);
  }
  return agents;
}

async function seedVoicePromptsAndIvr() {
  const categories = ['welcome', 'waiting', 'closed_hours', 'busy'] as const;
  const prompts = [];
  for (const c of categories) {
    prompts.push(
      await prisma.voicePrompt.create({
        data: { name: `رسالة ${c}`, category: c, fileName: `${c}.mp3`, url: '#', duration: randInt(8, 25), language: 'ar', sizeKb: randInt(120, 480) },
      })
    );
  }
  const menu = await prisma.ivrMenu.create({
    data: {
      name: 'الرد الآلي الرئيسي',
      description: 'القائمة الصوتية الرئيسية لمركز الاتصال',
      greetingPromptId: prompts[0].id,
      timeout: 8,
      timeoutDestination: 'queue:2009',
      invalidDestination: 'repeat',
      maxRepeats: 3,
      active: true,
      options: {
        create: [
          { key: '1', label: 'الدعم الفني', destinationType: 'queue', destinationValue: '2000' },
          { key: '2', label: 'المحاسبة', destinationType: 'queue', destinationValue: '2001' },
          { key: '3', label: 'المبيعات', destinationType: 'queue', destinationValue: '2002' },
          { key: '0', label: 'كل الموظفين', destinationType: 'queue', destinationValue: '2009' },
        ],
      },
    },
  });
  return { prompts, menu };
}

async function seedTg400() {
  const lines = [];
  for (let slot = 1; slot <= 4; slot++) {
    lines.push(
      await prisma.tg400Line.create({
        data: {
          slot,
          number: `0770${randInt(1000000, 9999999)}`,
          carrier: rand(CARRIERS),
          status: slot === 4 ? 'no_sim' : 'active',
          signal: slot === 4 ? 0 : randInt(55, 98),
          purpose: slot % 2 === 0 ? 'inbound' : 'outbound',
          inboundRoute: 'ivr:main',
          outboundRoute: 'trunk:tg400',
          usageCalls: randInt(100, 900),
          usageMinutes: randInt(400, 3000),
          usageCost: randInt(10, 120),
          balance: randInt(5, 90),
        },
      })
    );
  }
  return lines;
}

async function seedSubscribers() {
  const subs = [];
  for (let i = 0; i < 25; i++) {
    const sub = await prisma.subscriber.create({
      data: {
        name: `${rand(NAMES)} ${i + 1}`,
        phone: `0770${1000000 + i * 13337}`,
        pppoeUsername: `user${1000 + i}`,
        status: rand(['active', 'active', 'expired', 'suspended']),
        package: rand(PACKAGES),
        speed: rand(PACKAGES),
        expiration: daysAgo(-randInt(1, 60)),
        debt: randInt(0, 50000),
        lastActivation: daysAgo(randInt(1, 120)),
        address: 'بغداد - العراق',
        notes: i % 4 === 0 ? 'مشترك مميز' : undefined,
      },
    });
    if (i % 3 === 0) {
      await prisma.ticket.create({
        data: { subscriberId: sub.id, subject: 'انقطاع الخدمة', status: rand(['open', 'pending', 'resolved']), priority: rand(['low', 'medium', 'high']) },
      });
    }
    subs.push(sub);
  }
  return subs;
}

async function seedCalls(agents: { id: string }[], queues: { id: string }[], lines: { id: string }[], subs: { id: string }[]) {
  const dispositions = ['answered', 'answered', 'answered', 'missed', 'no_answer', 'abandoned', 'busy', 'failed'];
  for (let i = 0; i < 180; i++) {
    const disposition = rand(dispositions);
    const answered = disposition === 'answered';
    const agent = rand(agents);
    const startedAt = new Date(daysAgo(randInt(0, 14)).getTime() + randInt(8, 18) * 3_600_000);
    const talk = answered ? randInt(30, 600) : 0;
    const wait = randInt(2, 60);
    const call = await prisma.call.create({
      data: {
        callerNumber: `0770${randInt(1000000, 9999999)}`,
        destinationNumber: rand(['2000', '2001', '2002', '2009']),
        direction: rand(['inbound', 'inbound', 'outbound', 'internal']),
        status: 'ended',
        disposition,
        agentId: answered ? agent.id : Math.random() > 0.5 ? agent.id : null,
        queueId: rand(queues).id,
        lineId: rand(lines).id,
        subscriberId: Math.random() > 0.6 ? rand(subs).id : null,
        startedAt,
        answeredAt: answered ? new Date(startedAt.getTime() + wait * 1000) : null,
        endedAt: new Date(startedAt.getTime() + (wait + talk) * 1000),
        durationSec: wait + talk,
        talkTimeSec: talk,
        waitTimeSec: wait,
      },
    });
    await prisma.callEvent.create({ data: { callId: call.id, type: 'created', timestamp: startedAt } });
    if (answered) {
      await prisma.callEvent.create({ data: { callId: call.id, type: 'answered', actor: agent.id, timestamp: new Date(startedAt.getTime() + wait * 1000) } });
      if (i % 4 === 0) {
        await prisma.recording.create({
          data: {
            callId: call.id,
            callerNumber: call.callerNumber,
            agentId: call.agentId,
            fileName: `rec-${call.id}.wav`,
            url: '#',
            durationSec: talk,
            sizeKb: Math.round(talk * 8),
            recordedAt: startedAt,
          },
        });
      }
      if (i % 9 === 0) {
        await prisma.callEvent.create({ data: { callId: call.id, type: 'transfer', detail: 'تحويل إلى قائمة المحاسبة', actor: agent.id, timestamp: new Date(startedAt.getTime() + (wait + 10) * 1000) } });
      }
    }
  }
}

async function seedCallbacks(agents: { id: string }[], subs: { id: string }[]) {
  for (let i = 0; i < 12; i++) {
    await prisma.callback.create({
      data: {
        callerNumber: `0770${randInt(1000000, 9999999)}`,
        subscriberId: Math.random() > 0.5 ? rand(subs).id : null,
        scheduledFor: daysAgo(-randInt(0, 3)),
        status: rand(['pending', 'pending', 'completed', 'failed']),
        agentId: rand(agents).id,
        reason: rand(['طلب معاودة الاتصال', 'مشكلة فنية', 'استفسار عن الفاتورة']),
      },
    });
  }
}

async function seedSettingsAndNotifications() {
  await prisma.setting.upsert({
    where: { key: 'company' },
    update: {},
    create: {
      key: 'company',
      value: {
        name: 'مركز اتصال البرق', nameEn: 'Call Center Albarq', logo: '/logo.svg', themeColor: '#0ea5e9',
        language: 'ar', businessHours: { from: '08:00', to: '20:00', days: [0, 1, 2, 3, 4, 5] },
        closedMessage: 'مركز الاتصال مغلق حالياً. يرجى الاتصال خلال ساعات العمل.', holidays: [],
      },
    },
  });

  await prisma.setting.upsert({
    where: { key: 'asterisk' },
    update: {},
    create: {
      key: 'asterisk',
      value: {
        serverIp: '192.168.1.10', sipPort: 5060, rtpStart: 10000, rtpEnd: 20000,
        amiHost: '192.168.1.10', amiPort: 5038, amiUser: 'albarq',
        ariHost: '192.168.1.10', ariPort: 8088, ariUser: 'albarq',
        trunkName: 'tg400-trunk', trunkHost: '192.168.1.50',
        extensionStart: 1001, extensionEnd: 1099, recordingPath: '/var/spool/asterisk/monitor',
        codecs: ['alaw', 'ulaw', 'g729', 'opus'],
      },
    },
  });

  const notes = [
    { type: 'alert', title: 'انقطاع خط GSM', message: 'الخط في الفتحة 4 بدون شريحة' },
    { type: 'system', title: 'تحديث النظام', message: 'تم تحديث إعدادات Asterisk بنجاح' },
    { type: 'call', title: 'مكالمة فائتة', message: 'لديك 3 مكالمات فائتة في قائمة الدعم' },
  ];
  for (const n of notes) await prisma.notification.create({ data: n });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[seed] resetting...');
  await reset();
  // eslint-disable-next-line no-console
  console.log('[seed] roles + admin...');
  await seedRolesAndAdmin();
  const deps = await seedDepartments();
  const depIds = deps.map((d) => d.id);
  const queues = await seedQueues(depIds);
  const queueIds = queues.map((q) => q.id);
  const agents = await seedAgents(depIds, queueIds);
  await seedVoicePromptsAndIvr();
  const lines = await seedTg400();
  const subs = await seedSubscribers();
  await seedCalls(agents, queues, lines, subs);
  await seedCallbacks(agents, subs);
  await seedSettingsAndNotifications();
  // eslint-disable-next-line no-console
  console.log('[seed] done. Login with admin / admin123');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    await prisma.$disconnect();
    process.exit(1);
  });
