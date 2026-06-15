import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

const cuid = () => 't_' + randomUUID().replace(/-/g, '');

function userId(req: Request) {
  return (req as any).user?.id || (req as any).userId || null;
}

function mapDepartment(category: string, text = '') {
  const x = `${category} ${text}`.toLowerCase();

  if (/ضعف|تقطيع|انقطاع|بطء|سرعة|ping|packet|loss|internet|pppoe|service|فني/.test(x)) return 'dept_support';
  if (/مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب|payment|invoice|debt|money/.test(x)) return 'dept_accounts';
  if (/اشتراك|ترقية|باقه|باقة|عرض|بيع|sales|package/.test(x)) return 'dept_sales';
  if (/زيارة|نصب|تركيب|كيبل|كابل|راوتر|onu|fiber|صيانة/.test(x)) return 'dept_maintenance';
  if (/شكوى|تعامل|موظف|تأخير|complaint/.test(x)) return 'dept_complaints';

  return 'dept_general';
}

async function notify(userId: string | null, title: string, message: string, type = 'ticket') {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, title, message, type } as any }).catch(() => null);
}

async function extractMentions(body: string) {
  const names = Array.from(new Set((body.match(/@[\p{L}\p{N}._-]+/gu) || []).map(v => v.slice(1))));
  if (!names.length) return [];
  return prisma.user.findMany({
    where: {
      OR: [
        { username: { in: names } },
        { fullName: { in: names } },
      ],
    },
    select: { id: true, username: true, fullName: true },
  });
}

export const listTicketDepartments = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id,name,nameEn,color,active FROM TicketDepartment
    WHERE active=1
    ORDER BY FIELD(id,'dept_support','dept_accounts','dept_sales','dept_maintenance','dept_complaints','dept_admin','dept_general')
  `);
  res.json(rows);
});

export const listAdminTickets = asyncHandler(async (req: Request, res: Response) => {
  const status = String(req.query.status || '');
  const departmentId = String(req.query.departmentId || '');
  const q = String(req.query.q || '').trim();

  const where: string[] = [];
  const params: any[] = [];

  if (status) { where.push('t.status = ?'); params.push(status); }
  if (departmentId) { where.push('t.departmentId = ?'); params.push(departmentId); }
  if (q) {
    where.push('(t.subject LIKE ? OR t.externalName LIKE ? OR t.externalPhone LIKE ? OR t.externalPppoe LIKE ? OR CAST(t.ticketNo AS CHAR) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql = `
    SELECT
      t.*,
      d.name AS departmentName,
      d.color AS departmentColor,
      u.fullName AS assignedUserName,
      cu.fullName AS createdByName,
      (SELECT COUNT(*) FROM AdminTicketReply r WHERE r.ticketId=t.id) AS repliesCount,
      (SELECT COUNT(*) FROM AdminTicketAttachment a WHERE a.ticketId=t.id) AS attachmentsCount
    FROM AdminTicket t
    LEFT JOIN TicketDepartment d ON d.id=t.departmentId
    LEFT JOIN User u ON u.id=t.assignedUserId
    LEFT JOIN User cu ON cu.id=t.createdById
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.createdAt DESC
    LIMIT 200
  `;

  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
  res.json(rows);
});

export const getAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT t.*, d.name departmentName, d.color departmentColor, u.fullName assignedUserName
    FROM AdminTicket t
    LEFT JOIN TicketDepartment d ON d.id=t.departmentId
    LEFT JOIN User u ON u.id=t.assignedUserId
    WHERE t.id=?
    LIMIT 1
  `, id);

  if (!rows[0]) return res.status(404).json({ message: 'Ticket not found' });

  const replies = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*, u.fullName authorName
    FROM AdminTicketReply r
    LEFT JOIN User u ON u.id=r.authorId
    WHERE r.ticketId=?
    ORDER BY r.createdAt ASC
  `, id);

  const attachments = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM AdminTicketAttachment
    WHERE ticketId=?
    ORDER BY createdAt ASC
  `, id);

  res.json({ ticket: rows[0], replies, attachments });
});

export const createAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body || {};
  const id = cuid();

  const subject = String(body.subject || '').trim();
  if (!subject) return res.status(400).json({ message: 'subject required' });

  const description = String(body.description || '').trim();
  const category = String(body.category || 'general');
  const departmentId = body.departmentId || mapDepartment(category, `${subject} ${description}`);

  await prisma.$executeRawUnsafe(`
    INSERT INTO AdminTicket
    (id, subscriberId, externalId, externalName, externalPhone, externalPppoe, subject, description, category, departmentId, assignedUserId, status, priority, source, createdById)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `,
    id,
    body.subscriberId || null,
    body.externalId || null,
    body.externalName || null,
    body.externalPhone || null,
    body.externalPppoe || null,
    subject,
    description || null,
    category,
    departmentId,
    body.assignedUserId || null,
    body.status || 'new',
    body.priority || 'medium',
    body.source || 'admin',
    userId(req)
  );

  if (body.attachmentUrl) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO AdminTicketAttachment (id,ticketId,url,fileName,mimeType)
      VALUES (?,?,?,?,?)
    `, cuid(), id, body.attachmentUrl, body.fileName || null, body.mimeType || null);
  }

  if (body.assignedUserId) {
    await notify(body.assignedUserId, 'تكت جديد مسند لك', subject);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM AdminTicket WHERE id=? LIMIT 1', id);
  res.status(201).json(rows[0]);
});

export const replyAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const body = String(req.body?.body || '').trim();
  const visibility = String(req.body?.visibility || 'public');

  if (!body) return res.status(400).json({ message: 'body required' });

  const replyId = cuid();

  await prisma.$executeRawUnsafe(`
    INSERT INTO AdminTicketReply (id,ticketId,authorId,body,visibility)
    VALUES (?,?,?,?,?)
  `, replyId, ticketId, userId(req), body, visibility);

  if (req.body?.attachmentUrl) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO AdminTicketAttachment (id,ticketId,replyId,url,fileName,mimeType)
      VALUES (?,?,?,?,?,?)
    `, cuid(), ticketId, replyId, req.body.attachmentUrl, req.body.fileName || null, req.body.mimeType || null);
  }

  const mentioned = await extractMentions(body);
  for (const u of mentioned) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO AdminTicketMention (id,ticketId,replyId,userId)
      VALUES (?,?,?,?)
    `, cuid(), ticketId, replyId, u.id);

    await notify(u.id, 'تم ذكرك في تكت', body.slice(0, 160));
  }

  await prisma.$executeRawUnsafe(`UPDATE AdminTicket SET updatedAt=NOW(3) WHERE id=?`, ticketId);

  res.status(201).json({ id: replyId, mentioned });
});

export const updateAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  const allowed = ['status','priority','departmentId','assignedUserId','subject','description'];
  const sets: string[] = [];
  const params: any[] = [];

  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
      sets.push(`${k}=?`);
      params.push(req.body[k] || null);
    }
  }

  if (!sets.length) return res.json({ ok: true });

  if (req.body.status === 'closed' || req.body.status === 'resolved') {
    sets.push('closedAt=NOW(3)');
  }

  params.push(id);

  await prisma.$executeRawUnsafe(`
    UPDATE AdminTicket SET ${sets.join(', ')}, updatedAt=NOW(3)
    WHERE id=?
  `, ...params);

  if (req.body.assignedUserId) {
    await notify(req.body.assignedUserId, 'تم إسناد تكت لك', `Ticket ${id}`);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM AdminTicket WHERE id=? LIMIT 1', id);
  res.json(rows[0]);
});
