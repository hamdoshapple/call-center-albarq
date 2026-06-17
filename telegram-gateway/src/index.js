import express from 'express';
import fs from 'fs-extra';
import qrcode from 'qrcode';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 4200);
const TOKEN = process.env.TG_GATEWAY_TOKEN || 'change-me';
const SESSIONS_DIR = '/app/sessions';

fs.ensureDirSync(SESSIONS_DIR);

const sessions = {};
const queues = {};

function auth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
app.use(auth);

function cleanPhone(v) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '964' + n.slice(1);
  if (!n.startsWith('+')) n = '+' + n;
  return n;
}

function tokenToUrl(token) {
  const b64 = Buffer.from(token).toString('base64url');
  return `tg://login?token=${b64}`;
}

function sessionFile(id) {
  return `${SESSIONS_DIR}/${id}.session`;
}

function publicSession(id) {
  const s = sessions[id] || {};
  return {
    sessionId: id,
    status: s.status || 'saved',
    hasQr: !!s.qrUrl,
    qrUrl: s.qrUrl || null,
    lastError: s.lastError || null,
    connectedAt: s.connectedAt || null,
    queueLength: queues[id]?.length || 0
  };
}

async function getClient(sessionId, apiId, apiHash) {
  if (sessions[sessionId]?.client) return sessions[sessionId].client;

  const saved = fs.existsSync(sessionFile(sessionId)) ? fs.readFileSync(sessionFile(sessionId), 'utf8') : '';
  const client = new TelegramClient(new StringSession(saved), Number(apiId), String(apiHash), { connectionRetries: 5 });

  sessions[sessionId] = {
    ...(sessions[sessionId] || {}),
    client,
    status: 'connecting',
    apiId,
    apiHash,
    lastError: null
  };

  await client.connect();

  if (await client.isUserAuthorized()) {
    sessions[sessionId].status = 'connected';
    sessions[sessionId].connectedAt = new Date().toISOString();
    fs.writeFileSync(sessionFile(sessionId), client.session.save());
  } else {
    sessions[sessionId].status = 'qr';
  }

  return client;
}

async function exportQr(sessionId) {
  const s = sessions[sessionId];
  if (!s?.client) throw new Error('session not started');

  const r = await s.client.invoke(new Api.auth.ExportLoginToken({
    apiId: Number(s.apiId),
    apiHash: String(s.apiHash),
    exceptIds: []
  }));

  if (r instanceof Api.auth.LoginTokenSuccess) {
    s.status = 'connected';
    s.qrUrl = null;
    s.connectedAt = new Date().toISOString();
    fs.writeFileSync(sessionFile(sessionId), s.client.session.save());
    return null;
  }

  if (r instanceof Api.auth.LoginTokenMigrateTo) {
    await s.client._switchDC(r.dcId);
    const ok = await s.client.invoke(new Api.auth.ImportLoginToken({ token: r.token }));
    if (ok instanceof Api.auth.LoginTokenSuccess) {
      s.status = 'connected';
      s.qrUrl = null;
      s.connectedAt = new Date().toISOString();
      fs.writeFileSync(sessionFile(sessionId), s.client.session.save());
      return null;
    }
  }

  if (r instanceof Api.auth.LoginToken) {
    s.status = 'qr';
    s.qrUrl = tokenToUrl(r.token);
    return s.qrUrl;
  }

  return null;
}

app.post('/sessions/start', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const apiId = req.body?.apiId;
    const apiHash = req.body?.apiHash;

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    if (!apiId || !apiHash) return res.status(400).json({ error: 'apiId and apiHash required' });

    if (req.body?.force) {
      try { await sessions[sessionId]?.client?.disconnect?.(); } catch {}
      delete sessions[sessionId];
      fs.removeSync(sessionFile(sessionId));
    }

    await getClient(sessionId, apiId, apiHash);
    if (sessions[sessionId].status !== 'connected') await exportQr(sessionId);

    res.json({ ok: true, state: publicSession(sessionId) });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'start failed' });
  }
});

app.get('/sessions/status/:id', async (req, res) => {
  const s = sessions[req.params.id];
  try {
    if (s?.client && s.status !== 'connected') await exportQr(req.params.id).catch(() => null);
    if (s?.client && await s.client.isUserAuthorized()) {
      s.status = 'connected';
      s.qrUrl = null;
      s.connectedAt = s.connectedAt || new Date().toISOString();
      fs.writeFileSync(sessionFile(req.params.id), s.client.session.save());
    }
  } catch (e) {
    if (s) {
      s.status = 'error';
      s.lastError = e?.message || String(e);
    }
  }
  res.json(publicSession(req.params.id));
});

app.get('/sessions/qr/:id', async (req, res) => {
  const s = sessions[req.params.id];
  if (s?.client && s.status !== 'connected') await exportQr(req.params.id).catch(() => null);
  const qrImage = s?.qrUrl ? await qrcode.toDataURL(s.qrUrl) : null;
  res.json({ ...publicSession(req.params.id), qrImage });
});

app.post('/sessions/logout', async (req, res) => {
  const sessionId = String(req.body?.sessionId || '');
  try { await sessions[sessionId]?.client?.disconnect?.(); } catch {}
  delete sessions[sessionId];
  delete queues[sessionId];
  fs.removeSync(sessionFile(sessionId));
  res.json({ ok: true });
});

async function sendByPhone(sessionId, phoneRaw, message) {
  const s = sessions[sessionId];
  if (!s?.client || s.status !== 'connected') throw new Error('session not connected');

  const phone = cleanPhone(phoneRaw);
  const contact = new Api.InputPhoneContact({
    clientId: BigInt(Date.now()),
    phone,
    firstName: 'Albarq',
    lastName: 'Subscriber'
  });

  const imported = await s.client.invoke(new Api.contacts.ImportContacts({ contacts: [contact] }));
  const user = imported.users?.[0];

  if (!user) throw new Error('phone not found on Telegram');

  await s.client.sendMessage(user, { message });
  return { ok: true, phone };
}

app.post('/send', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const to = req.body?.to;
    const message = String(req.body?.message || '').trim();

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    if (!to) return res.status(400).json({ error: 'to required' });
    if (!message) return res.status(400).json({ error: 'empty message' });

    const r = await sendByPhone(sessionId, to, message);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'send failed' });
  }
});

app.listen(PORT, () => console.log(`[tg] gateway listening on ${PORT}`));
