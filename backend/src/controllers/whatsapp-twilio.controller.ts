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

function saveBase64Media(dataUrl: string) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;

  const buf = Buffer.from(m[2], 'base64');

  let mime = m[1];
  let ext = 'jpg';

  // Detect real file signature, not browser-provided mime
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    mime = 'image/jpeg';
    ext = 'jpg';
  } else if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    mime = 'image/png';
    ext = 'png';
  } else if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp';
    ext = 'webp';
  } else if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') {
    mime = 'image/gif';
    ext = 'gif';
  }

  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const dir = ensureMediaDir();
  fs.writeFileSync(path.join(dir, name), buf);
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
      unreadCount: unreadInc,
    },
    update: {
      lastMessage: lastMessage || undefined,
      lastAt: new Date(),
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
    webhookUrl: `${req.protocol}://${req.get('host')}/api/whatsapp-twilio/webhook`,
    lastError: row.lastError || '',
  });
}

export async function saveSettings(req: Request, res: Response) {
  const current = await getSettingRow();
  const { accountSid, authToken, whatsappFrom, enabled } = req.body || {};

  const row = await prisma.twilioWhatsappSetting.update({
    where: { id: current.id },
    data: {
      accountSid: typeof accountSid === 'string' ? accountSid.trim() : current.accountSid,
      authToken: typeof authToken === 'string' && authToken.trim() ? authToken.trim() : current.authToken,
      whatsappFrom: typeof whatsappFrom === 'string' ? cleanWhatsappPhone(whatsappFrom) : current.whatsappFrom,
      enabled: Boolean(enabled),
      lastError: null,
    },
  });

  res.json({
    enabled: row.enabled,
    accountSid: row.accountSid || '',
    authTokenMasked: maskToken(row.authToken),
    whatsappFrom: row.whatsappFrom || '',
  });
}

export async function conversations(req: Request, res: Response) {
  const q = String(req.query.q || '').trim().toLowerCase();

  const rows = await prisma.twilioWhatsappContact.findMany({
    orderBy: [{ lastAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const enriched = await Promise.all(rows.map(async (row) => {
    const subscribers = await findSubscribersForPhone(row.phone);
    const subscriber = subscribers[0] || null;
    if (subscriber?.name && row.name !== subscriber.name) {
      await prisma.twilioWhatsappContact.update({
        where: { id: row.id },
        data: { name: subscriber.name },
      }).catch(() => null);
    }
    return { ...row, subscriber, subscribers };
  }));

  const filtered = q
    ? enriched.filter((x: any) => {
        const blob = [
          x.phone,
          x.name,
          x.lastMessage,
          x.subscriber?.name,
          x.subscriber?.phone,
          x.subscriber?.pppoeUsername,
          x.subscriber?.package,
          x.subscriber?.status,
        ].join(' ').toLowerCase();
        return blob.includes(q);
      })
    : enriched;

  res.json(filtered);
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
  const imageData = String(req.body?.imageData || '');
  const savedMedia = imageData ? saveBase64Media(imageData) : null;
  if (!body && !savedMedia) return res.status(400).json({ message: 'EMPTY_MESSAGE' });

  const setting = await getSettingRow();
  if (!setting.enabled || !setting.accountSid || !setting.authToken || !setting.whatsappFrom) {
    return res.status(400).json({ message: 'TWILIO_NOT_CONFIGURED' });
  }

  const contact = await prisma.twilioWhatsappContact.findUnique({ where: { id: contactId } });
  if (!contact) return res.status(404).json({ message: 'CONTACT_NOT_FOUND' });

  const client = Twilio(setting.accountSid, setting.authToken);
  const mediaUrl = savedMedia ? `${publicBase(req)}/api/whatsapp-twilio/media/${savedMedia.name}` : null;

  const sent = await client.messages.create({
    from: asWhatsapp(setting.whatsappFrom),
    to: asWhatsapp(contact.phone),
    body: body || undefined,
    mediaUrl: mediaUrl ? [mediaUrl] : undefined,
  });

  const msg = await prisma.twilioWhatsappMessage.create({
    data: {
      contactId,
      direction: 'outbound',
      body,
      mediaUrl,
      mediaType: savedMedia?.mime || null,
      status: sent.status || 'sent',
      twilioSid: sent.sid,
      fromNumber: cleanWhatsappPhone(setting.whatsappFrom),
      toNumber: contact.phone,
    },
  });

  await prisma.twilioWhatsappContact.update({
    where: { id: contactId },
    data: { lastMessage: body, lastAt: new Date() },
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

  const head = fs.readFileSync(full).subarray(0, 16);
  const type =
    head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? 'image/jpeg' :
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 ? 'image/png' :
    head.toString('ascii', 0, 3) === 'GIF' ? 'image/gif' :
    head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' :
    'application/octet-stream';

  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(full);
}
