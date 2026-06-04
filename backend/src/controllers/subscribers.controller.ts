import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  pppoeUsername: z.string().optional(),
  status: z.enum(['active', 'expired', 'suspended', 'disabled']).optional(),
  package: z.string().optional(),
  speed: z.string().optional(),
  expiration: z.string().optional(),
  debt: z.number().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function search(req: Request, res: Response) {
  const q = String(req.query.q ?? '').trim();
  const rows = await prisma.subscriber.findMany({
    where: q
      ? { OR: [{ phone: { contains: q } }, { name: { contains: q } }, { pppoeUsername: { contains: q } }] }
      : undefined,
    take: 50,
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows);
}

export async function getOne(req: Request, res: Response) {
  const row = await prisma.subscriber.findUnique({
    where: { id: req.params.id },
    include: { tickets: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw ApiError.notFound('Subscriber not found');
  res.json(row);
}

export async function getTickets(req: Request, res: Response) {
  const rows = await prisma.ticket.findMany({
    where: { subscriberId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  const notes = rows.length
    ? await prisma.note.findMany({
        where: {
          refType: 'ticket',
          refId: { in: rows.map((t) => t.id) },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const notesByTicket = new Map<string, typeof notes>();

  for (const note of notes) {
    const list = notesByTicket.get(note.refId) ?? [];
    list.push(note);
    notesByTicket.set(note.refId, list);
  }

  res.json(
    rows.map((ticket) => ({
      ...ticket,
      notes: notesByTicket.get(ticket.id) ?? [],
    }))
  );
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.subscriber.create({
    data: { ...data, expiration: data.expiration ? new Date(data.expiration) : null },
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.subscriber.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Subscriber not found');
  const row = await prisma.subscriber.update({
    where: { id: req.params.id },
    data: { ...data, expiration: data.expiration ? new Date(data.expiration) : undefined },
  });
  res.json(row);
}


const ticketSchema = z.object({
  subject: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  call: z.object({
    callerNumber: z.string().optional(),
    callerName: z.string().optional().nullable(),
    startedAt: z.string().optional(),
    agentExtension: z.string().optional().nullable(),
    line: z.string().optional().nullable(),
    destinationNumber: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
});

export async function createTicket(req: Request, res: Response) {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: req.params.id },
  });

  if (!subscriber) throw ApiError.notFound('Subscriber not found');

  const data = ticketSchema.parse(req.body);
  const c = data.call;

  const safeSubject = data.subject.slice(0, 180);

  const details = [
    '--- تفاصيل الاتصال ---',
    `المشترك: ${subscriber.name}`,
    `الهاتف: ${subscriber.phone}`,
    `يوزر PPPoE: ${subscriber.pppoeUsername ?? '—'}`,
    `الباقة: ${subscriber.package ?? '—'} / ${subscriber.speed ?? '—'}`,
    `الدين: ${subscriber.debt ?? 0}`,
    `حالة الاشتراك: ${subscriber.status}`,
    c ? `رقم المتصل: ${c.callerNumber ?? '—'}` : '',
    c ? `الوجهة: ${c.destinationNumber ?? '—'}` : '',
    c ? `الموظف/الامتداد: ${c.agentExtension ?? '—'}` : '',
    c ? `الخط: ${c.line ?? '—'}` : '',
    c ? `وقت الاتصال: ${c.startedAt ?? new Date().toISOString()}` : '',
    c ? `حالة الاتصال: ${c.status ?? '—'}` : '',
  ].filter(Boolean).join('\n');

  const ticket = await prisma.ticket.create({
    data: {
      subscriberId: subscriber.id,
      subject: safeSubject,
      priority: data.priority ?? 'medium',
      status: 'open',
    },
  });

  await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: details,
      authorId: req.user?.id,
    },
  });

  res.status(201).json({ ...ticket, details });
}


const ticketStatusSchema = z.object({
  status: z.enum(['open', 'pending', 'resolved', 'closed']),
});

export async function updateTicketStatus(req: Request, res: Response) {
  const data = ticketStatusSchema.parse(req.body);

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      subscriberId: req.params.id,
    },
  });

  if (!ticket) throw ApiError.notFound('Ticket not found');

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: data.status },
  });

  await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: `تم تغيير حالة التذكرة إلى: ${data.status}`,
      authorId: req.user?.id,
    },
  });

  res.json(updated);
}


const ticketCommentSchema = z.object({
  body: z.string().min(1),
});

export async function addTicketComment(req: Request, res: Response) {
  const data = ticketCommentSchema.parse(req.body);

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: req.params.ticketId,
      subscriberId: req.params.id,
    },
  });

  if (!ticket) throw ApiError.notFound('Ticket not found');

  const note = await prisma.note.create({
    data: {
      refType: 'ticket',
      refId: ticket.id,
      body: data.body,
      authorId: req.user?.id,
    },
  });

  res.status(201).json(note);
}
