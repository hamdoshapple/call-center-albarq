import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Twilio from 'twilio';
import { prisma } from '../config/prisma.js';
import { searchExternalSubscribers } from '../services/external-subscriber.service.js';
import { searchSubscriberCache, upsertExternalSubscriberCache } from '../services/subscriber-cache.service.js';


function publicBase(req: Request) {
  const host = req.get('host');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto === 'http' ? 'https' : proto}://${host}`;
}

function ensureMediaDir() {
  const dir = '/app/uploads/whatsapp-twilio';
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}


async function downloadTwilioMedia(req: Request, url: string, mime: string) {
  if (!url) return null;
  const setting = await getSettingRow();
  if (!setting.accountSid || !setting.authToken) return url;

  const ext =
    mime.includes('png') ? 'png' :
    mime.includes('webp') ? 'webp' :
    mime.includes('gif') ? 'gif' :
    mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'bin';

  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const full = path.join(ensureMediaDir(), name);
  const auth = Buffer.from(`${setting.accountSid}:${setting.authToken}`).toString('base64');

  const r = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!r.ok) return url;

  const ab = await r.arrayBuffer();
  fs.writeFileSync(full, Buffer.from(ab));
  return `${publicBase(req)}/api/whatsapp-twilio/media/${name}`;
}

function saveBase64Media(dataUrl: string, preferredType = '') {
  const m = String(dataUrl || '').match(/^([a-zA-Z0-9/+.-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    || String(dataUrl || '').match(/^data:([a-zA-Z0-9/+.-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;

  const inputMime = m[1];
  const buf = Buffer.from(m[2], 'base64');

  let mime = preferredType || inputMime;
  let ext = 'bin';

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    mime = 'image/jpeg'; ext = 'jpg';
  } else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    mime = 'image/png'; ext = 'png';
  } else if (buf.toString('ascii', 0, 3) === 'GIF') {
    mime = 'image/gif'; ext = 'gif';
  } else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp'; ext = 'webp';
  } else if (buf.toString('ascii', 0, 4) === '%PDF') {
    mime = 'application/pdf'; ext = 'pdf';
  } else if (mime.includes('pdf') || inputMime.includes('pdf')) {
    mime = 'application/pdf'; ext = 'pdf';
  } else if (mime.includes('webm')) {
    mime = 'audio/webm'; ext = 'webm';
  } else if (mime.includes('ogg')) {
    mime = 'audio/ogg'; ext = 'ogg';
  } else if (mime.includes('mpeg') || mime.includes('mp3')) {
    mime = 'audio/mpeg'; ext = 'mp3';
  } else if (mime.includes('mp4') || mime.includes('m4a')) {
    mime = 'audio/mp4'; ext = 'm4a';
  } else if (mime.includes('wav')) {
    mime = 'audio/wav'; ext = 'wav';
  } else if (mime.includes('wordprocessingml') || mime.includes('msword')) {
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; ext = 'docx';
  } else if (mime.includes('spreadsheetml') || mime.includes('excel')) {
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = 'xlsx';
  }

  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(ensureMediaDir(), name), buf);
  return { name, mime };
}

function cleanWhatsappPhone(v: any) {
  return String(v || '').replace(/^whatsapp:/, '').trim();
}


function normPhone(v: any) {
  let s = String(v || '').replace(/^whatsapp:/, '').replace(/\D/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0')) s = '964' + s.slice(1);
  return s;
}

async function findSubscribersForPhone(phone: string) {
  const n = normPhone(phone);
  const variants = Array.from(new Set([
    n,
    n.startsWith('964') ? '0' + n.slice(3) : n,
    n.startsWith('964') ? '+' + n : n,
  ].filter(Boolean)));

  const map = new Map<string, any>();

  function addRows(rows: any[], source: string) {
    for (const x of rows || []) {
      const id = String(x.id || '');
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        name: x.name || x.fullName || '',
        phone: x.phone || '',
        pppoeUsername: x.pppoeUsername || '',
        package: x.package || x.packageName || '',
        status: x.status || '',
        debt: Number(x.debt || 0),
        expiration: x.expiration || null,
        source,
      });
    }
  }

  if (process.env.EXTERNAL_MSSQL_ENABLED === 'true') {
    for (const q of variants) {
      const live = await searchExternalSubscribers(q).catch(() => []);
      if (live.length) {
        await upsertExternalSubscriberCache(live).catch(() => null);
        addRows(live, 'live');
      }
    }
    if (map.size) return Array.from(map.values());
  }

  for (const q of variants) {
    const cached = await searchSubscriberCache(q).catch(() => []);
    addRows(cached, 'cache');
  }
  if (map.size) return Array.from(map.values());

  for (const q of variants) {
    const local = await prisma.subscriber.findMany({
      where: { OR: [{ phone: { contains: q } }, { pppoeUsername: { contains: q } }, { name: { contains: q } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []);
    addRows(local, 'local');
  }

  return Array.from(map.values());
}

function asWhatsapp(v: string) {
  const phone = cleanWhatsappPhone(v).replace(/[^\d+]/g, '');
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

function maskToken(v?: string | null) {
  if (!v) return '';
  return `••••••••${v.slice(-4)}`;
}

async function getSettingRow() {
  let row = await prisma.twilioWhatsappSetting.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!row) {
    row = await prisma.twilioWhatsappSetting.create({ data: {} });
  }
  return row;
}

async function upsertContact(phone: string, lastMessage?: string, unreadInc = 0) {
  return prisma.twilioWhatsappContact.upsert({
    where: { phone },
    create: {
      phone,
      lastMessage: lastMessage || '',
      lastAt: new Date(),
      lastInboundAt: unreadInc > 0 ? new Date() : undefined,
      unreadCount: unreadInc,
    },
    update: {
      lastMessage: lastMessage || undefined,
      lastAt: new Date(),
      lastInboundAt: unreadInc > 0 ? new Date() : undefined,
      unreadCount: { increment: unreadInc },
    },
  });
}

export async function getSettings(req: Request, res: Response) {
  const row = await getSettingRow();
  res.json({
    enabled: row.enabled,
    accountSid: row.accountSid || '',
    authTokenMasked: maskToken(row.authToken),
    whatsappFrom: row.whatsappFrom || '',
    conversationWindowHours: row.conversationWindowHours || 24,
    webhookUrl: `${req.protocol}://${req.get('host')}/api/whatsapp-twilio/webhook`,
    lastError: row.lastError || '',
  });
}

export async function saveSettings(req: Request, res: Response) {
  const current = await getSettingRow();
  const { accountSid, authToken, whatsappFrom, enabled, conversationWindowHours } = req.body || {};

  const row = await prisma.twilioWhatsappSetting.update({
    where: { id: current.id },
    data: {
      accountSid: typeof accountSid === 'string' ? accountSid.trim() : current.accountSid,
      authToken: typeof authToken === 'string' && authToken.trim() ? authToken.trim() : current.authToken,
      whatsappFrom: typeof whatsappFrom === 'string' ? cleanWhatsappPhone(whatsappFrom) : current.whatsappFrom,
      enabled: Boolean(enabled),
      conversationWindowHours: Math.max(1, Math.min(720, Number(conversationWindowHours || current.conversationWindowHours || 24))),
      lastError: null,
    },
  });

  res.json({
    enabled: row.enabled,
    accountSid: row.accountSid || '',
    authTokenMasked: maskToken(row.authToken),
    whatsappFrom: row.whatsappFrom || '',
    conversationWindowHours: row.conversationWindowHours || 24,
  });
}

export async function conversations(req: Request, res: Response) {
  const q = String(req.query.q || '').trim();
  const take = Math.max(10, Math.min(80, Number(req.query.take || 20)));
  const cursor = String(req.query.cursor || '').trim();

  const where: any = q
    ? {
        OR: [
          { phone: { contains: q } },
          { name: { contains: q } },
          { lastMessage: { contains: q } },
        ],
      }
    : {};

  const rows = await prisma.twilioWhatsappContact.findMany({
    where,
    orderBy: [
      { lastAt: 'desc' },
      { createdAt: 'desc' },
    ],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const pageRows = rows.slice(0, take);
  const hasMore = rows.length > take;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.id || null : null;

  res.json({
    rows: pageRows.map((row: any) => ({
      ...row,
      subscriber: null,
      subscribers: [],
      conversationOpen: false,
      windowExpiresAt: null,
    })),
    nextCursor,
    hasMore,
  });
}

export async function conversationProfile(req: Request, res: Response) {
  const row = await prisma.twilioWhatsappContact.findUnique({
    where: { id: String(req.params.id || '') },
  });

  if (!row) return res.status(404).json({ message: 'CONTACT_NOT_FOUND' });

  const setting = await getSettingRow();
  const hours = Number(setting.conversationWindowHours || 24);

  const subscribers = await findSubscribersForPhone(row.phone).catch(() => []);
  const subscriber = subscribers[0] || null;

  const lastInboundAt = row.lastInboundAt ? new Date(row.lastInboundAt).getTime() : 0;
  const windowExpiresAt = lastInboundAt ? new Date(lastInboundAt + hours * 60 * 60 * 1000) : null;
  const conversationOpen = !!windowExpiresAt && windowExpiresAt.getTime() > Date.now();

  res.json({
    subscriber,
    subscribers,
    conversationOpen,
    windowExpiresAt,
    conversationWindowHours: hours,
  });
}


export async function messages(req: Request, res: Response) {
  const contactId = String(req.params.id);
  const rows = await prisma.twilioWhatsappMessage.findMany({
    where: { contactId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  res.json(rows);
}

export async function markRead(req: Request, res: Response) {
  const contactId = String(req.params.id);
  await prisma.twilioWhatsappContact.update({
    where: { id: contactId },
    data: { unreadCount: 0 },
  });
  res.json({ ok: true });
}

export async function reply(req: Request, res: Response) {
  const contactId = String(req.params.id);
  const body = String(req.body?.body || '').trim();
  const imageData = String(req.body?.imageData || req.body?.fileData || '');
  const fileType = String(req.body?.fileType || '');
  const savedMedia = imageData ? saveBase64Media(imageData, fileType) : null;
  if (!body && !savedMedia) return res.status(400).json({ message: 'EMPTY_MESSAGE' });

  const user: any = (req as any).user || {};
  const agentName = String(user.fullName || user.name || user.username || 'موظف');
  const agentId = user.id ? String(user.id) : null;

  const setting = await getSettingRow();
  if (!setting.enabled || !setting.accountSid || !setting.authToken || !setting.whatsappFrom) {
    return res.status(400).json({ message: 'TWILIO_NOT_CONFIGURED' });
  }

  const contact = await prisma.twilioWhatsappContact.findUnique({ where: { id: contactId } });
  if (!contact) return res.status(404).json({ message: 'CONTACT_NOT_FOUND' });

  const windowHours = Number(setting.conversationWindowHours || 24);
  const lastInboundAt = contact.lastInboundAt ? new Date(contact.lastInboundAt).getTime() : 0;
  const windowExpiresAt = lastInboundAt + windowHours * 60 * 60 * 1000;
  if (!lastInboundAt || windowExpiresAt <= Date.now()) {
    return res.status(403).json({
      message: 'CONVERSATION_WINDOW_CLOSED',
      lastInboundAt: contact.lastInboundAt,
      windowHours,
    });
  }

  // contact already loaded


  const client = Twilio(setting.accountSid, setting.authToken);
  const mediaUrl = savedMedia ? `${publicBase(req)}/api/whatsapp-twilio/media/${savedMedia.name}` : null;

  const sent = await client.messages.create({
    from: asWhatsapp(setting.whatsappFrom),
    to: asWhatsapp(contact.phone),
    body: body || undefined,
    mediaUrl: mediaUrl ? [mediaUrl] : undefined,
    statusCallback: `${publicBase(req)}/api/whatsapp-twilio/status-callback`,
  });

  const msg = await prisma.twilioWhatsappMessage.create({
    data: {
      contactId,
      direction: 'outbound',
      body,
      mediaUrl,
      mediaType: savedMedia?.mime || null,
      agentName,
      agentId,
      status: sent.status || 'sent',
      twilioSid: sent.sid,
      fromNumber: cleanWhatsappPhone(setting.whatsappFrom),
      toNumber: contact.phone,
    },
  });

  await prisma.twilioWhatsappContact.update({
    where: { id: contactId },
    data: { lastMessage: body || (savedMedia?.mime?.startsWith('image/') ? 'صورة' : savedMedia ? 'مرفق' : ''), lastAt: new Date() },
  });

  res.json(msg);
}

export async function webhook(req: Request, res: Response) {
  const from = cleanWhatsappPhone(req.body?.From);
  const to = cleanWhatsappPhone(req.body?.To);
  const body = String(req.body?.Body || '');
  const sid = String(req.body?.MessageSid || req.body?.SmsMessageSid || '');
  const rawMediaUrl = String(req.body?.MediaUrl0 || '');
  const mediaType = String(req.body?.MediaContentType0 || '');
  const mediaUrl = rawMediaUrl ? await downloadTwilioMedia(req, rawMediaUrl, mediaType) : '';

  if (!from) return res.status(200).send('OK');

  const contact = await upsertContact(from, body, 1);

  if (sid) {
    const exists = await prisma.twilioWhatsappMessage.findUnique({ where: { twilioSid: sid } }).catch(() => null);
    if (!exists) {
      await prisma.twilioWhatsappMessage.create({
        data: {
          contactId: contact.id,
          direction: 'inbound',
          body,
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null,
          status: 'received',
          twilioSid: sid,
          fromNumber: from,
          toNumber: to,
        },
      });
    }
  } else {
    await prisma.twilioWhatsappMessage.create({
      data: {
        contactId: contact.id,
        direction: 'inbound',
        body,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        status: 'received',
        fromNumber: from,
        toNumber: to,
      },
    });
  }

  res.type('text/xml').send('<Response></Response>');
}


export async function mediaFile(req: Request, res: Response) {
  const file = path.basename(String(req.params.file || ''));
  const full = path.join('/app/uploads/whatsapp-twilio', file);
  if (!fs.existsSync(full)) return res.status(404).send('Not found');

  const ext = path.extname(file).toLowerCase().replace('.', '');
  const head = fs.readFileSync(full).subarray(0, 16);

  const type =
    head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? 'image/jpeg' :
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 ? 'image/png' :
    head.toString('ascii', 0, 3) === 'GIF' ? 'image/gif' :
    head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' :
    head.toString('ascii', 0, 4) === '%PDF' ? 'application/pdf' :
    ext === 'webm' ? 'audio/webm' :
    ext === 'ogg' ? 'audio/ogg' :
    ext === 'mp3' ? 'audio/mpeg' :
    ext === 'm4a' ? 'audio/mp4' :
    ext === 'mp4' ? 'video/mp4' :
    ext === 'wav' ? 'audio/wav' :
    ext === 'pdf' ? 'application/pdf' :
    ext === 'doc' ? 'application/msword' :
    ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
    ext === 'xls' ? 'application/vnd.ms-excel' :
    ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
    'application/octet-stream';

  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `inline; filename="${file}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(full);
}

export async function statusCallback(req: Request, res: Response) {
  const sid = String(req.body?.MessageSid || req.body?.SmsSid || '');
  const status = String(req.body?.MessageStatus || req.body?.SmsStatus || '');
  const errorCode = req.body?.ErrorCode ? String(req.body.ErrorCode) : null;
  const errorMessage = req.body?.ErrorMessage ? String(req.body.ErrorMessage) : null;

  if (sid && status) {
    console.log('[twilio-status]', { sid, status, errorCode, errorMessage });
    await prisma.twilioWhatsappMessage.updateMany({
      where: { twilioSid: sid },
      data: {
        status,
        ...(errorCode || errorMessage ? { body: undefined } : {}),
      },
    }).catch(() => null);
  }

  res.type('text/xml').send('<Response></Response>');
}
