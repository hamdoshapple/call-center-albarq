import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import qrcode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 4100);
const TOKEN = process.env.WA_GATEWAY_TOKEN || 'change-me';
const SESSIONS_DIR = '/app/sessions';

fs.ensureDirSync(SESSIONS_DIR);

const sessions = {};
const queues = {};

function auth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(auth);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanPhone(v) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '964' + n.slice(1);
  if (n.length === 10 && !n.startsWith('964')) n = '964' + n;
  return n;
}

function publicSession(sessionId) {
  const s = sessions[sessionId] || {};
  return {
    sessionId,
    status: s.status || 'saved',
    hasQr: !!s.qr,
    lastError: s.lastError || null,
    connectedAt: s.connectedAt || null,
    queueLength: queues[sessionId]?.length || 0,
  };
}

async function createSession(sessionId) {
  if (sessions[sessionId]?.status === 'connected') return;

  const sessionPath = `${SESSIONS_DIR}/${sessionId}`;
  fs.ensureDirSync(sessionPath);

  sessions[sessionId] = {
    ...(sessions[sessionId] || {}),
    status: 'starting',
    qr: null,
    sock: null,
    lastError: null,
  };

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  console.log('[wa] starting:', sessionId, version.join('.'));

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'info' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 90_000,
    keepAliveIntervalMs: 25_000,
    defaultQueryTimeoutMs: 90_000,
    generateHighQualityLinkPreview: false,
  });

  sessions[sessionId].sock = sock;
  sessions[sessionId].status = 'connecting';

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessions[sessionId].qr = qr;
      sessions[sessionId].status = 'qr';
      sessions[sessionId].lastError = null;
      console.log('[wa] QR ready:', sessionId);
    }

    if (connection === 'open') {
      sessions[sessionId].status = 'connected';
      sessions[sessionId].qr = null;
      sessions[sessionId].lastError = null;
      sessions[sessionId].connectedAt = new Date().toISOString();
      console.log('[wa] connected:', sessionId);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const msg = lastDisconnect?.error?.message || String(lastDisconnect?.error || '');
      const loggedOut = code === DisconnectReason.loggedOut;

      sessions[sessionId].status = loggedOut ? 'logged_out' : 'disconnected';
      sessions[sessionId].lastError = `code=${code || '-'} ${msg}`;

      console.log('[wa] closed:', sessionId, sessions[sessionId].lastError);

      if (loggedOut) {
        try { fs.removeSync(sessionPath); } catch {}
        return;
      }

      await sleep(15000);
      if (sessions[sessionId]?.status !== 'connected') {
        createSession(sessionId).catch((e) => console.error('[wa] reconnect failed:', e.message));
      }
    }
  });
}

async function removeSession(sessionId) {
  try { sessions[sessionId]?.sock?.end?.(); } catch {}
  delete sessions[sessionId];
  delete queues[sessionId];
  try { fs.removeSync(`${SESSIONS_DIR}/${sessionId}`); } catch {}
}

app.post('/sessions/start', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    if (req.body?.force) await removeSession(sessionId);
    await createSession(sessionId);

    res.json({ ok: true, state: publicSession(sessionId) });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'start failed' });
  }
});

app.get('/sessions/status/:id', async (req, res) => {
  const sessionId = req.params.id;
  if (!sessions[sessionId]) {
    createSession(sessionId).catch((e) => console.error('[wa] lazy start failed:', e.message));
  }
  res.json(publicSession(sessionId));
});

app.get('/sessions/qr/:id', async (req, res) => {
  const sessionId = req.params.id;
  const s = sessions[sessionId];
  let qrImage = null;

  if (s?.qr) qrImage = await qrcode.toDataURL(s.qr);

  res.json({
    ...publicSession(sessionId),
    qr: s?.qr || null,
    qrImage,
  });
});

app.post('/sessions/pair-code/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const phone = cleanPhone(req.body?.phone);

    if (!phone) return res.status(400).json({ error: 'phone required' });

    if (!sessions[sessionId]) {
      await createSession(sessionId);
      await sleep(1500);
    }

    const s = sessions[sessionId];
    if (!s?.sock) return res.status(404).json({ error: 'session not found' });
    if (s.status === 'connected') return res.json({ ok: true, connected: true, code: null });

    const code = await s.sock.requestPairingCode(phone);
    res.json({ ok: true, phone, code });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'pair code failed' });
  }
});

app.post('/sessions/logout', async (req, res) => {
  const sessionId = String(req.body?.sessionId || '');
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  await removeSession(sessionId);
  res.json({ ok: true });
});

async function processQueue(sessionId) {
  if (!queues[sessionId]?.length || queues[sessionId].processing) return;
  queues[sessionId].processing = true;

  while (queues[sessionId].length > 0) {
    const job = queues[sessionId][0];
    const s = sessions[sessionId];

    if (!s || s.status !== 'connected') {
      job.reject(new Error('session not connected'));
      queues[sessionId].shift();
      continue;
    }

    try {
      await sleep(job.delay * 1000);
      await s.sock.sendMessage(`${job.to}@s.whatsapp.net`, { text: job.message });
      job.resolve({ ok: true });
    } catch (e) {
      job.reject(e);
    }

    queues[sessionId].shift();
  }

  queues[sessionId].processing = false;
}

app.post('/send', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const to = cleanPhone(req.body?.to);
    const message = String(req.body?.message || '').trim();

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    if (!to) return res.status(400).json({ error: 'invalid phone' });
    if (!message) return res.status(400).json({ error: 'empty message' });

    const s = sessions[sessionId];
    if (!s || s.status !== 'connected') {
      return res.status(409).json({ error: 'session not connected', status: s?.status || 'missing' });
    }

    const delay = Math.floor(Math.random() * 8) + 5;

    if (!queues[sessionId]) queues[sessionId] = [];

    const result = await new Promise((resolve, reject) => {
      queues[sessionId].push({ to, message, delay, delayMs: Number(req.body?.delayMs || req.body?.delay || 0), resolve, reject });
      processQueue(sessionId).catch(reject);
    });

    res.json({ ok: true, sessionId, result });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'send failed' });
  }
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log('[wa] Baileys gateway running on :' + PORT);

  for (const sessionId of fs.readdirSync(SESSIONS_DIR)) {
    if (sessionId) {
      createSession(sessionId).catch((e) => console.error('[wa] auto restore failed:', sessionId, e.message));
    }
  }
});
