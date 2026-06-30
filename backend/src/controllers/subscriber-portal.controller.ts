import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { searchSubscriberCache, cacheSubscriberPayments, getCachedSubscriberPayments } from '../services/subscriber-cache.service.js';
import { searchExternalSubscribers, getExternalSubscriberPayments } from '../services/external-subscriber.service.js';
import { sendWhatsappToPhones } from './push.controller.js';

import { sendPushToEmployees } from './push.controller.js';
const otpStore = new Map<string, { code: string; expiresAt: number; lastSentAt: number; attempts: number }>();

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpMessage(code: string) {
  return `رمز التحقق: ${code}

رمز الدخول إلى تطبيق البرق

⏳ صالح لمدة 5 دقائق فقط

لا تشارك هذا الرمز مع أي شخص.
إذا لم تطلب الرمز تجاهل هذه الرسالة.`;
}

function norm(v: unknown) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) return '0' + d.slice(3);
  return d;
}

function clean(v: unknown) {
  return String(v || '').replace(/NULL/gi, '').replace(/\s+/g, ' ').trim();
}

function secret() {
  return process.env.SUBSCRIBER_PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'subscriber-portal-secret';
}

function sign(phone: string) {
  return jwt.sign({ phone, type: 'subscriber' }, secret(), { expiresIn: '30d' });
}

function verify(req: Request) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return jwt.verify(token, secret()) as { phone: string; type: string };
}

export async function requestCode(req: Request, res: Response) {
  const phone = norm(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const localCount = await prisma.subscriber.count({
    where: { phone: { contains: phone } },
  });

  let external: any[] = [];
  try {
    external = await searchExternalSubscribers(phone);
  } catch {
    external = [];
  }

  const cached = external.length ? [] : await searchSubscriberCache(phone);

  if (!localCount && !external.length && !cached.length) {
    return res.status(404).json({
      error: 'Phone not found',
      message: 'رقم الهاتف غير مسجل لدينا، يرجى التواصل مع الدعم.',
    });
  }

  const now = Date.now();
  const old = otpStore.get(phone);

  if (old && now - old.lastSentAt < 60_000) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'انتظر دقيقة قبل طلب رمز جديد.',
      retryAfter: Math.ceil((60_000 - (now - old.lastSentAt)) / 1000),
    });
  }

  const code = makeCode();
  otpStore.set(phone, {
    code,
    expiresAt: now + 5 * 60_000,
    lastSentAt: now,
    attempts: 0,
  });

  const wa = await sendWhatsappToPhones([phone], otpMessage(code));

  if (!wa.sent) {
    return res.status(503).json({
      error: 'OTP send failed',
      message: 'تعذر إرسال رمز التحقق حالياً، تأكد من جلسات الواتساب.',
      wa,
    });
  }

  res.json({
    ok: true,
    message: 'تم إرسال رمز التحقق عبر واتساب',
    expiresIn: 300,
    retryAfter: 60,
  });
}

export async function login(req: Request, res: Response) {
  const phone = norm(req.body?.phone);
  const code = String(req.body?.code || '').replace(/\D/g, '');

  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const row = otpStore.get(phone);
  if (!row) {
    return res.status(401).json({ error: 'Code not requested', message: 'اطلب رمز تحقق أولاً.' });
  }

  if (Date.now() > row.expiresAt) {
    otpStore.delete(phone);
    return res.status(401).json({ error: 'Code expired', message: 'انتهت صلاحية الرمز، اطلب رمز جديد.' });
  }

  row.attempts += 1;
  if (row.attempts > 5) {
    otpStore.delete(phone);
    return res.status(429).json({ error: 'Too many attempts', message: 'محاولات كثيرة، اطلب رمز جديد.' });
  }

  if (code !== row.code) {
    otpStore.set(phone, row);
    return res.status(401).json({ error: 'Invalid code', message: 'رمز التحقق غير صحيح.' });
  }

  otpStore.delete(phone);
  res.json({ token: sign(phone), phone });
}

export async function accounts(req: Request, res: Response) {
  const payload = verify(req);
  const phone = norm(payload.phone);

  const local = await prisma.subscriber.findMany({
    where: { phone: { contains: phone } },
    orderBy: { debt: 'desc' },
  });

  let external: any[] = [];
  try {
    external = await searchExternalSubscribers(phone);
  } catch {
    external = [];
  }

  const cached = external.length ? [] : await searchSubscriberCache(phone);

  const rows = [
    ...local.map((x) => ({ ...x, source: 'local' })),
    ...external.map((x: any) => ({ ...x, source: 'live' })),
    ...cached.map((x: any) => ({ ...x, source: 'cache' })),
  ];

  const unique = new Map<string, any>();
  for (const x of rows) {
    const key = `${x.source}-${x.id || x.externalId || x.pppoeUsername || x.phone}`;
    unique.set(key, {
      id: String(x.id || x.externalId || key),
      name: clean(x.name || x.pppoeUsername || 'مشترك'),
      phone: clean(x.phone || phone),
      pppoeUsername: clean(x.pppoeUsername || ''),
      status: x.status || 'active',
      package: clean(x.package || '—'),
      speed: clean(x.speed || '—'),
      expiration: x.expiration || null,
      debt: Number(x.debt || 0),
      address: clean(x.address || '—'),
      notes: clean(x.notes || ''),
      source: x.source,
    });
  }

  res.json([...unique.values()]);
}

export async function me(req: Request, res: Response) {
  const payload = verify(req);
  res.json({ phone: payload.phone });
}

export async function appConfig(_req: Request, res: Response) {
  const cfg = await prisma.subscriberAppConfig.findFirst();

  const banners = await prisma.subscriberAppBanner.findMany({
    where: { active: true },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  res.json({
    config: cfg,
    banners,
  });
}


export async function accountPayments(req: Request, res: Response) {
  const payload = verify(req);
  const phone = norm(payload.phone);
  const id = String(req.params.id || '');

  const accountsRows = await searchExternalSubscribers(phone);
  const allowed = accountsRows.some((x: any) => String(x.id) === id);

  if (!allowed) {
    return res.status(403).json({ error: 'Account not allowed' });
  }

  let rows: any[] = [];

  try {
    rows = await getExternalSubscriberPayments(id, 50);
    if (rows.length) {
      try { await cacheSubscriberPayments(id, 50); } catch {}
    }
  } catch {
    rows = [];
  }

  if (!rows.length) {
    return res.json(await getCachedSubscriberPayments(id, 50));
  }

  const payments = rows.filter((x) => x.type === 'payment');
  const activations = rows.filter((x) => x.type === 'activation');
  const debts = rows.filter((x) => x.type === 'debt');

  res.json({
    summary: {
      totalPaid: payments.reduce((s, x) => s + Number(x.amount || 0), 0),
      totalActivations: activations.reduce((s, x) => s + Number(x.amount || 0), 0),
      totalDebtRows: debts.reduce((s, x) => s + Number(x.amount || 0), 0),
      paymentsCount: payments.length,
      source: 'live',
    },
    rows,
  });
}


async function resolvePortalAccount(req: Request, accountId: string) {
  const payload = verify(req);
  const phone = norm(payload.phone);

  let rows: any[] = [];

  try {
    rows = await searchExternalSubscribers(phone);
  } catch {
    rows = [];
  }

  const cached = await searchSubscriberCache(phone);
  rows = [
    ...rows.map((x: any) => ({ ...x, source: 'live' })),
    ...cached.map((x: any) => ({ ...x, source: 'cache' })),
  ];

  const account = rows.find((x: any) => String(x.id || x.externalId) === accountId);

  if (!account) {
    return null;
  }

  return {
    id: String(account.id || account.externalId),
    name: clean(account.name || 'مشترك'),
    phone: clean(account.phone || phone),
    pppoeUsername: clean(account.pppoeUsername || ''),
    package: clean(account.package || '—'),
    speed: clean(account.speed || '—'),
    status: account.status || 'active',
    debt: Number(account.debt || 0),
    expiration: account.expiration || null,
    address: clean(account.address || '—'),
    notes: clean(account.notes || ''),
    source: account.source || account.externalSource || 'portal',
  };
}

async function ticketWithNotes(ticket: any) {
  const notes = await prisma.note.findMany({
    where: { refType: 'ticket', refId: ticket.id },
    include: {
      author: {
        select: { id: true, username: true, fullName: true, email: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return { ...ticket, notes };
}

export async function listAccountTickets(req: Request, res: Response) {
  const accountId = String(req.params.id || '');
  const account = await resolvePortalAccount(req, accountId);

  if (!account) {
    return res.status(403).json({ error: 'Account not allowed' });
  }

  const rows = await prisma.ticket.findMany({
    where: accountId.startsWith('ext-')
      ? { externalId: accountId }
      : { subscriberId: accountId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const notes = rows.length
    ? await prisma.note.findMany({
        where: {
          refType: 'ticket',
          refId: { in: rows.map((x) => x.id) },
        },
        include: {
          author: {
            select: { id: true, username: true, fullName: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const byTicket = new Map<string, typeof notes>();

  for (const n of notes) {
    const list = byTicket.get(n.refId) || [];
    list.push(n);
    byTicket.set(n.refId, list);
  }

  res.json(rows.map((t) => ({
    ...t,
    notes: byTicket.get(t.id) || [],
  })));
}

export async function getAccountTicket(req: Request, res: Response) {
  const accountId = String(req.params.id || '');
  const account = await resolvePortalAccount(req, accountId);

  if (!account) {
    return res.status(403).json({ error: 'Account not allowed' });
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      ...(accountId.startsWith('ext-') ? { externalId: accountId } : { subscriberId: accountId }),
    },
  });

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.json(await ticketWithNotes(ticket));
}

export async function createAccountTicket(req: Request, res: Response) {
  const accountId = String(req.params.id || '');
  const account = await resolvePortalAccount(req, accountId);

  if (!account) {
    return res.status(403).json({ error: 'Account not allowed' });
  }

  const subject = clean(req.body?.subject || req.body?.type || 'طلب دعم فني').slice(0, 180);
  const body = clean(req.body?.body || req.body?.description || '');

  if (!subject) {
    return res.status(400).json({ error: 'Subject is required' });
  }

  const ticket = await prisma.ticket.create({
    data: {
      subscriberId: accountId.startsWith('ext-') ? null : accountId,

      externalId: accountId.startsWith('ext-') ? accountId : null,
      externalName: accountId.startsWith('ext-') ? account.name : null,
      externalPhone: accountId.startsWith('ext-') ? account.phone : null,
      externalPppoe: accountId.startsWith('ext-') ? account.pppoeUsername : null,
      externalSource: account.source,

      subject,
      priority: req.body?.priority || 'medium',
      status: 'open',
    },
  });

  const details = [
    '--- تذكرة من تطبيق المشترك ---',
    `المشترك: ${account.name}`,
    `الهاتف: ${account.phone}`,
    `External ID: ${account.id}`,
    `يوزر PPPoE: ${account.pppoeUsername || '—'}`,
    `الباقة: ${account.package || '—'} / ${account.speed || '—'}`,
    `الحالة: ${account.status}`,
    `الدين: ${account.debt}`,
    `المصدر: ${account.source}`,
    '',
    '--- تفاصيل المشكلة ---',
    body || '—',
  ].join('\n');

  await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: details,
      authorId: null,
    },
  });

  // ticket-push-portal-created
  await sendPushToEmployees(
    'تذكرة جديدة من المشترك',
    `${ticket.subject || 'طلب دعم فني'} · ${account.name || account.phone || 'مشترك'}`,
    `/employee/tickets?ticket=${ticket.id}`,
    {
      tag: `ticket-${ticket.id}`,
      ticketId: ticket.id,
      type: 'ticket',
    }
  ).catch(() => null);

  res.status(201).json(await ticketWithNotes(ticket));
}

export async function addAccountTicketComment(req: Request, res: Response) {
  const accountId = String(req.params.id || '');
  const account = await resolvePortalAccount(req, accountId);

  if (!account) {
    return res.status(403).json({ error: 'Account not allowed' });
  }

  const body = clean(req.body?.body || '');
  if (!body) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      ...(accountId.startsWith('ext-') ? { externalId: accountId } : { subscriberId: accountId }),
    },
  });

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  const note = await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: `رد المشترك:\n${body}`,
      authorId: null,
    },
  });

  res.status(201).json(note);
}
