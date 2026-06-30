import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendPushToPhones } from './push.controller.js';

import { sendPushToEmployees } from './push.controller.js';
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


async function ticketPhone(ticketId: string) {
  if (ticketId.startsWith('legacy_')) {
    const realId = ticketId.replace(/^legacy_/, '');
    const rows = await prisma.$queryRawUnsafe<any[]>('SELECT externalPhone FROM Ticket WHERE id=? LIMIT 1', realId);
    return rows[0]?.externalPhone || null;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>('SELECT externalPhone FROM AdminTicket WHERE id=? LIMIT 1', ticketId);
  return rows[0]?.externalPhone || null;
}

async function pushTicketUpdate(ticketId: string, title: string, message: string) {
  const phone = await ticketPhone(ticketId);
  if (!phone) return;
  await sendPushToPhones([phone], title, message, '/my').catch(() => null);
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


export const searchTicketSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();

  if (q.length < 2) return res.json([]);

  const like = `%${q}%`;

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM (
      SELECT
        externalId AS externalId,
        NULL AS subscriberId,
        name,
        phone,
        pppoeUsername,
        status,
        package AS packageName,
        debt,
        'external-cache' AS source,
        cachedAt AS updatedAt
      FROM ExternalSubscriberCache
      WHERE name LIKE ? OR phone LIKE ? OR pppoeUsername LIKE ? OR externalId LIKE ?

      UNION ALL

      SELECT
        externalId AS externalId,
        NULL AS subscriberId,
        name,
        phone,
        pppoeUsername,
        status,
        package AS packageName,
        debt,
        'cache' AS source,
        cachedAt AS updatedAt
      FROM SubscriberCache
      WHERE name LIKE ? OR phone LIKE ? OR pppoeUsername LIKE ? OR externalId LIKE ?

      UNION ALL

      SELECT
        NULL AS externalId,
        id AS subscriberId,
        name,
        phone,
        pppoeUsername,
        status,
        package AS packageName,
        debt,
        'local' AS source,
        updatedAt AS updatedAt
      FROM Subscriber
      WHERE name LIKE ? OR phone LIKE ? OR pppoeUsername LIKE ?
    ) x
    ORDER BY updatedAt DESC
    LIMIT 30
  `, like, like, like, like, like, like, like, like, like, like, like);

  res.json(JSON.parse(JSON.stringify(rows, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  )));
});


export const listTicketDepartments = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id,name,nameEn,color,active FROM TicketDepartment
    WHERE active=1
    ORDER BY FIELD(id,'dept_support','dept_accounts','dept_sales','dept_maintenance','dept_complaints','dept_admin','dept_general')
  `);
  res.json(JSON.parse(JSON.stringify(rows, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  )));
});


export const listAdminTickets = asyncHandler(async (req: Request, res: Response) => {
  const status = String(req.query.status || '');
  const departmentId = String(req.query.departmentId || '');
  const q = String(req.query.q || '').trim();

  const adminWhere: string[] = ["t.id NOT LIKE 'legacy_%'"];
  const legacyWhere: string[] = [];
  const params: any[] = [];

  if (status) {
    adminWhere.push('t.status = ?');
    legacyWhere.push('t.status = ?');
    params.push(status);
  }

  if (departmentId) {
    adminWhere.push('t.departmentId = ?');
    legacyWhere.push(`
      CASE
        WHEN LOWER(t.subject) REGEXP 'ضعف|تقطيع|انقطاع|بطء|سرعة|pppoe|internet|خدمة' THEN 'dept_support'
        WHEN LOWER(t.subject) REGEXP 'مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب' THEN 'dept_accounts'
        WHEN LOWER(t.subject) REGEXP 'اشتراك|ترقية|باقة|باقه|عرض' THEN 'dept_sales'
        WHEN LOWER(t.subject) REGEXP 'زيارة|تركيب|كيبل|كابل|راوتر|onu|صيانة' THEN 'dept_maintenance'
        WHEN LOWER(t.subject) REGEXP 'شكوى|تعامل|موظف' THEN 'dept_complaints'
        ELSE 'dept_general'
      END = ?
    `);
    params.push(departmentId);
  }

  if (q) {
    adminWhere.push('(t.subject LIKE ? OR t.externalName LIKE ? OR t.externalPhone LIKE ? OR t.externalPppoe LIKE ? OR CAST(t.ticketNo AS CHAR) LIKE ?)');
    legacyWhere.push('(t.subject LIKE ? OR t.externalName LIKE ? OR t.externalPhone LIKE ? OR t.externalPppoe LIKE ? OR t.id LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const adminSql = `
    SELECT
      t.id,
      t.ticketNo,
      t.subscriberId,
      t.externalId,
      t.externalName,
      t.externalPhone,
      t.externalPppoe,
      t.subject,
      t.description,
      t.category,
      t.departmentId,
      t.assignedUserId,
      t.status,
      t.priority,
      t.source,
      t.createdById,
      t.closedAt,
      t.createdAt,
      t.updatedAt,
      d.name AS departmentName,
      d.color AS departmentColor,
      u.fullName AS assignedUserName,
      cu.fullName AS createdByName,
      CAST((SELECT COUNT(*) FROM AdminTicketReply r WHERE r.ticketId=t.id) AS UNSIGNED) + 0 AS repliesCount,
      CAST((SELECT COUNT(*) FROM AdminTicketAttachment a WHERE a.ticketId=t.id) AS UNSIGNED) + 0 AS attachmentsCount
    FROM AdminTicket t
    LEFT JOIN TicketDepartment d ON d.id=t.departmentId
    LEFT JOIN User u ON u.id=t.assignedUserId
    LEFT JOIN User cu ON cu.id=t.createdById
    ${adminWhere.length ? 'WHERE ' + adminWhere.join(' AND ') : ''}
  `;

  const legacySql = `
    SELECT
      CONCAT('legacy_', t.id) AS id,
      NULL AS ticketNo,
      t.subscriberId,
      t.externalId,
      t.externalName,
      t.externalPhone,
      t.externalPppoe,
      t.subject,
      NULL AS description,
      'subscriber' AS category,
      CASE
        WHEN LOWER(t.subject) REGEXP 'ضعف|تقطيع|انقطاع|بطء|سرعة|pppoe|internet|خدمة' THEN 'dept_support'
        WHEN LOWER(t.subject) REGEXP 'مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب' THEN 'dept_accounts'
        WHEN LOWER(t.subject) REGEXP 'اشتراك|ترقية|باقة|باقه|عرض' THEN 'dept_sales'
        WHEN LOWER(t.subject) REGEXP 'زيارة|تركيب|كيبل|كابل|راوتر|onu|صيانة' THEN 'dept_maintenance'
        WHEN LOWER(t.subject) REGEXP 'شكوى|تعامل|موظف' THEN 'dept_complaints'
        ELSE 'dept_general'
      END AS departmentId,
      t.agentId AS assignedUserId,
      t.status,
      t.priority,
      'subscriber' AS source,
      NULL AS createdById,
      NULL AS closedAt,
      t.createdAt,
      t.updatedAt,
      d.name AS departmentName,
      d.color AS departmentColor,
      u.fullName AS assignedUserName,
      NULL AS createdByName,
      CAST((SELECT COUNT(*) FROM Note n WHERE n.refType='ticket' AND n.refId=t.id) AS UNSIGNED) + 0 AS repliesCount,
      0 AS attachmentsCount
    FROM Ticket t
    LEFT JOIN TicketDepartment d ON d.id =
      CASE
        WHEN LOWER(t.subject) REGEXP 'ضعف|تقطيع|انقطاع|بطء|سرعة|pppoe|internet|خدمة' THEN 'dept_support'
        WHEN LOWER(t.subject) REGEXP 'مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب' THEN 'dept_accounts'
        WHEN LOWER(t.subject) REGEXP 'اشتراك|ترقية|باقة|باقه|عرض' THEN 'dept_sales'
        WHEN LOWER(t.subject) REGEXP 'زيارة|تركيب|كيبل|كابل|راوتر|onu|صيانة' THEN 'dept_maintenance'
        WHEN LOWER(t.subject) REGEXP 'شكوى|تعامل|موظف' THEN 'dept_complaints'
        ELSE 'dept_general'
      END
    LEFT JOIN User u ON u.id=t.agentId
    ${legacyWhere.length ? 'WHERE ' + legacyWhere.join(' AND ') : ''}
  `;

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM (
      ${adminSql}
      UNION ALL
      ${legacySql}
    ) x
    ORDER BY x.createdAt DESC
    LIMIT 300
  `, ...params, ...params);

  res.json(JSON.parse(JSON.stringify(rows, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  )));
});

export const getAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;

  if (id.startsWith('legacy_')) {
    const realId = id.replace(/^legacy_/, '');

    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CONCAT('legacy_', t.id) AS id,
        NULL AS ticketNo,
        t.subscriberId,
        t.externalId,
        t.externalName,
        t.externalPhone,
        t.externalPppoe,
        t.subject,
        NULL AS description,
        'subscriber' AS category,
        CASE
          WHEN LOWER(t.subject) REGEXP 'ضعف|تقطيع|انقطاع|بطء|سرعة|pppoe|internet|خدمة' THEN 'dept_support'
          WHEN LOWER(t.subject) REGEXP 'مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب' THEN 'dept_accounts'
          WHEN LOWER(t.subject) REGEXP 'اشتراك|ترقية|باقة|باقه|عرض' THEN 'dept_sales'
          WHEN LOWER(t.subject) REGEXP 'زيارة|تركيب|كيبل|كابل|راوتر|onu|صيانة' THEN 'dept_maintenance'
          WHEN LOWER(t.subject) REGEXP 'شكوى|تعامل|موظف' THEN 'dept_complaints'
          ELSE 'dept_general'
        END AS departmentId,
        t.agentId AS assignedUserId,
        t.status,
        t.priority,
        'subscriber' AS source,
        t.createdAt,
        t.updatedAt,
        d.name AS departmentName,
        d.color AS departmentColor,
        u.fullName AS assignedUserName
      FROM Ticket t
      LEFT JOIN TicketDepartment d ON d.id =
        CASE
          WHEN LOWER(t.subject) REGEXP 'ضعف|تقطيع|انقطاع|بطء|سرعة|pppoe|internet|خدمة' THEN 'dept_support'
          WHEN LOWER(t.subject) REGEXP 'مبلغ|دين|دفع|فاتورة|رصيد|مالي|حساب' THEN 'dept_accounts'
          WHEN LOWER(t.subject) REGEXP 'اشتراك|ترقية|باقة|باقه|عرض' THEN 'dept_sales'
          WHEN LOWER(t.subject) REGEXP 'زيارة|تركيب|كيبل|كابل|راوتر|onu|صيانة' THEN 'dept_maintenance'
          WHEN LOWER(t.subject) REGEXP 'شكوى|تعامل|موظف' THEN 'dept_complaints'
          ELSE 'dept_general'
        END
      LEFT JOIN User u ON u.id=t.agentId
      WHERE t.id=?
      LIMIT 1
    `, realId);

    if (!rows[0]) return res.status(404).json({ message: 'Ticket not found' });

    const replies = await prisma.$queryRawUnsafe<any[]>(`
      SELECT n.id, n.refId AS ticketId, n.authorId, n.body, 'public' AS visibility, n.createdAt, u.fullName authorName
      FROM Note n
      LEFT JOIN User u ON u.id=n.authorId
      WHERE n.refType='ticket' AND n.refId=?
      ORDER BY n.createdAt ASC
    `, realId);

    const attachments = replies
      .filter((r: any) => String(r.body || '').startsWith('مرفق صورة:'))
      .map((r: any) => {
        const firstLine = String(r.body || '').split('\n')[0] || '';
        const url = firstLine.replace('مرفق صورة:', '').trim();
        return {
          id: r.id,
          ticketId: id,
          url,
          fileName: 'صورة مرفقة',
          mimeType: 'image/*',
          createdAt: r.createdAt,
        };
      })
      .filter((a: any) => a.url);

    return res.json({ ticket: rows[0], replies, attachments });
  }

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
  const createdTicket = rows[0];

  // ticket-push-admin-created
  await sendPushToEmployees(
    'تذكرة جديدة',
    `${createdTicket?.subject || 'تذكرة جديدة'}${createdTicket?.externalName ? ' · ' + createdTicket.externalName : ''}`,
    `/employee/tickets?ticket=${createdTicket.id}`,
    {
      tag: `ticket-${createdTicket.id}`,
      ticketId: createdTicket.id,
      type: 'ticket',
    }
  ).catch(() => null);

  res.status(201).json(createdTicket);
});

export const replyAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const body = String(req.body?.body || '').trim();
  const visibility = String(req.body?.visibility || 'public');

  if (!body) return res.status(400).json({ message: 'body required' });

  if (ticketId.startsWith('legacy_')) {
    const realId = ticketId.replace(/^legacy_/, '');
    const replyId = cuid();

    await prisma.note.create({
      data: {
        id: replyId,
        refType: 'ticket',
        refId: realId,
        body,
        authorId: userId(req),
      } as any,
    });

    // team-reply-push-legacy
    await sendTicketReplyPushToTeam(
      ticketId,
      'رد جديد على التذكرة',
      body.slice(0, 140),
      userId(req)
    );

    const mentioned = await extractMentions(body);
    for (const u of mentioned) {
      await notify(u.id, 'تم ذكرك في تكت', body.slice(0, 160));
    }

    await pushTicketUpdate(ticketId, 'رد جديد على التذكرة', body.slice(0, 120));
    return res.status(201).json({ id: replyId, mentioned });
  }

  const replyId = cuid();

  await prisma.$executeRawUnsafe(`
    INSERT INTO AdminTicketReply (id,ticketId,authorId,body,visibility)
    VALUES (?,?,?,?,?)
  `, replyId, ticketId, userId(req), body, visibility);

  // team-reply-push-admin-ticket
  await sendTicketReplyPushToTeam(
    ticketId,
    'رد جديد على التذكرة',
    body.slice(0, 140),
    userId(req)
  );

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

  await pushTicketUpdate(ticketId, 'رد جديد على التذكرة', body.slice(0, 120));
  res.status(201).json({ id: replyId, mentioned });
});

export const updateAdminTicket = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;

  if (id.startsWith('legacy_')) {
    const realId = id.replace(/^legacy_/, '');
    const allowedLegacy = ['status','priority','subject','assignedUserId'];
    const sets: string[] = [];
    const params: any[] = [];

    for (const k of allowedLegacy) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        const col = k === 'assignedUserId' ? 'agentId' : k;
        sets.push(`${col}=?`);
        params.push(req.body[k] || null);
      }
    }

    if (!sets.length) return res.json({ ok: true });

    params.push(realId);
    await prisma.$executeRawUnsafe(`UPDATE Ticket SET ${sets.join(', ')}, updatedAt=NOW(3) WHERE id=?`, ...params);

    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT CONCAT('legacy_', id) AS id, subject, status, priority, createdAt, updatedAt FROM Ticket WHERE id=? LIMIT 1`, realId);
    return res.json(rows[0]);
  }

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

  if (req.body.status) {
    await pushTicketUpdate(id, 'تم تحديث حالة التذكرة', `الحالة الجديدة: ${req.body.status}`);
  }

  const rows = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM AdminTicket WHERE id=? LIMIT 1', id);
  res.json(rows[0]);
});


async function ensureTicketTeamTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AdminTicketTeam (
      id VARCHAR(191) PRIMARY KEY,
      ticketId VARCHAR(191) NOT NULL,
      userId VARCHAR(191) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'member',
      invitedById VARCHAR(191) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY AdminTicketTeam_ticket_user_unique (ticketId, userId),
      KEY AdminTicketTeam_ticket_idx (ticketId),
      KEY AdminTicketTeam_user_idx (userId)
    )
  `);
}

export const listTicketUsers = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT u.id, u.fullName, u.username, u.email
    FROM User u
    WHERE u.active=1
    ORDER BY u.fullName ASC
  `);
  res.json(rows);
});

export const getTicketTeam = asyncHandler(async (req: Request, res: Response) => {
  await ensureTicketTeamTable();
  const ticketId = String(req.params.id || '');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT tt.id, tt.ticketId, tt.userId, tt.role, tt.createdAt,
           u.fullName, u.username, u.email
    FROM AdminTicketTeam tt
    LEFT JOIN User u ON u.id=tt.userId
    WHERE tt.ticketId=?
    ORDER BY tt.createdAt ASC
  `, ticketId);

  res.json(rows);
});

export const inviteTicketUser = asyncHandler(async (req: Request, res: Response) => {
  await ensureTicketTeamTable();

  const ticketId = String(req.params.id || '');
  const userIdToInvite = String(req.body?.userId || '').trim();
  const note = String(req.body?.note || '').trim();

  if (!ticketId || !userIdToInvite) {
    return res.status(400).json({ message: 'ticketId and userId are required' });
  }

  const inviterId = userId(req);

  let ticket: any = null;
  let legacyRealId = '';

  if (ticketId.startsWith('legacy_')) {
    legacyRealId = ticketId.replace(/^legacy_/, '');

    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        CONCAT('legacy_', id) AS id,
        subject,
        status,
        priority,
        createdAt,
        updatedAt
      FROM Ticket
      WHERE id=?
      LIMIT 1
    `, legacyRealId);

    ticket = rows[0];
  } else {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM AdminTicket WHERE id=? LIMIT 1
    `, ticketId);

    ticket = rows[0];
  }

  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

  const userRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, fullName, username FROM User WHERE id=? LIMIT 1
  `, userIdToInvite);

  const invited = userRows[0];
  if (!invited) return res.status(404).json({ message: 'User not found' });

  await prisma.$executeRawUnsafe(`
    INSERT INTO AdminTicketTeam (id,ticketId,userId,role,invitedById)
    VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE role=VALUES(role), invitedById=VALUES(invitedById)
  `, cuid(), ticketId, userIdToInvite, 'member', inviterId || null);

  const logBody = `تم استدعاء ${invited.fullName || invited.username} للتذكرة.${note ? '\nملاحظة: ' + note : ''}`;

  if (ticketId.startsWith('legacy_')) {
    await prisma.note.create({
      data: {
        id: cuid(),
        refType: 'ticket',
        refId: legacyRealId,
        body: logBody,
        authorId: inviterId || null,
      } as any,
    });
  } else {
    await prisma.$executeRawUnsafe(`
      INSERT INTO AdminTicketReply (id,ticketId,authorId,body,visibility)
      VALUES (?,?,?,?,?)
    `, cuid(), ticketId, inviterId || null, logBody, 'internal');
  }

  await sendPushToEmployees(
    'تم استدعاؤك لتذكرة',
    `${ticket.subject || 'تذكرة'}${note ? ' · ' + note : ''}`,
    `/employee/tickets?ticket=${ticketId}`,
    {
      employeeIds: [userIdToInvite],
      tag: `ticket-invite-${ticketId}-${userIdToInvite}`,
      ticketId,
      type: 'ticket',
    }
  ).catch(() => null);

  res.json({ ok: true });
});


export const removeTicketUser = asyncHandler(async (req: Request, res: Response) => {
  await ensureTicketTeamTable();

  const ticketId = String(req.params.id || '');
  const userIdToRemove = String(req.params.userId || '');

  await prisma.$executeRawUnsafe(`
    DELETE FROM AdminTicketTeam WHERE ticketId=? AND userId=?
  `, ticketId, userIdToRemove);

  res.json({ ok: true });
});


async function sendTicketReplyPushToTeam(ticketId: string, title: string, message: string, authorId?: string | null) {
  try {
    await ensureTicketTeamTable();

    const teamRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT userId
      FROM AdminTicketTeam
      WHERE ticketId=?
    `, ticketId);

    let ownerRows: any[] = [];

    if (ticketId.startsWith('legacy_')) {
      const realId = ticketId.replace(/^legacy_/, '');
      ownerRows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT assignedUserId, createdById
        FROM Ticket
        WHERE id=?
        LIMIT 1
      `, realId).catch(() => []);
    } else {
      ownerRows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT assignedUserId, createdById
        FROM AdminTicket
        WHERE id=?
        LIMIT 1
      `, ticketId).catch(() => []);
    }

    const owner = ownerRows[0] || {};

    const employeeIds = Array.from(new Set([
      ...teamRows.map((x: any) => String(x.userId || '').trim()),
      String(owner.assignedUserId || '').trim(),
      String(owner.createdById || '').trim(),
    ].filter((id: string) => id && id !== String(authorId || ''))));

    if (!employeeIds.length) return;

    await sendPushToEmployees(
      title,
      message,
      `/employee/tickets?ticket=${ticketId}`,
      {
        employeeIds,
        tag: `ticket-reply-${ticketId}-${Date.now()}`,
        ticketId,
        type: 'ticket',
      }
    ).catch(() => null);
  } catch {}
}
