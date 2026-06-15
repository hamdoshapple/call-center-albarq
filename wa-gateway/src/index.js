import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { Client, LocalAuth } from 'whatsapp-web.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const TOKEN = process.env.WA_GATEWAY_TOKEN || 'change-me';
const PORT = Number(process.env.PORT || 4100);
const clients = new Map();
const states = new Map();

function auth(req, res, next) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function norm(to) {
  let n = String(to || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '964' + n.slice(1);
  return `${n}@c.us`;
}

function getState(id) {
  return states.get(id) || { sessionId: id, status: 'idle', hasQr: false, qrImage: null, lastError: null };
}

async function startSession(id, force = false) {
  if (clients.has(id) && !force) return getState(id);

  if (clients.has(id)) {
    try { await clients.get(id).destroy(); } catch {}
    clients.delete(id);
  }

  states.set(id, { sessionId: id, status: 'starting', hasQr: false, qrImage: null, lastError: null });

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: '/app/.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
    }
  });

  client.on('qr', async (qr) => {
    const qrImage = await QRCode.toDataURL(qr);
    states.set(id, { ...getState(id), status: 'qr', hasQr: true, qrImage });
  });

  client.on('ready', () => states.set(id, { ...getState(id), status: 'connected', hasQr: false, qrImage: null, connectedAt: new Date().toISOString() }));
  client.on('authenticated', () => states.set(id, { ...getState(id), status: 'authenticated' }));
  client.on('disconnected', (reason) => states.set(id, { ...getState(id), status: 'disconnected', lastError: String(reason || '') }));
  client.on('auth_failure', (msg) => states.set(id, { ...getState(id), status: 'error', lastError: String(msg || '') }));

  clients.set(id, client);
  client.initialize().catch((e) => states.set(id, { ...getState(id), status: 'error', lastError: e?.message || String(e) }));
  return getState(id);
}

app.use(auth);

app.post('/sessions/start', async (req, res) => {
  const id = String(req.body.sessionId || '').trim();
  if (!id) return res.status(400).json({ error: 'sessionId required' });
  const state = await startSession(id, !!req.body.force);
  res.json({ ok: true, state });
});

app.get('/sessions/status/:id', (req, res) => res.json(getState(req.params.id)));
app.get('/sessions/qr/:id', (req, res) => res.json({ qrImage: getState(req.params.id).qrImage || null }));

app.post('/sessions/logout', async (req, res) => {
  const id = String(req.body.sessionId || '');
  try { if (clients.has(id)) await clients.get(id).logout(); } catch {}
  try { if (clients.has(id)) await clients.get(id).destroy(); } catch {}
  clients.delete(id);
  states.set(id, { sessionId: id, status: 'disconnected', hasQr: false, qrImage: null });
  res.json({ ok: true });
});

app.post('/sessions/pair-code/:id', async (req, res) => {
  const client = clients.get(req.params.id);
  if (!client) return res.status(404).json({ error: 'session not started' });
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    const code = await client.requestPairingCode(phone);
    res.json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/send', async (req, res) => {
  const { sessionId, to, message } = req.body || {};
  const client = clients.get(String(sessionId || ''));
  if (!client) return res.status(404).json({ error: 'session not found' });

  const st = getState(sessionId);
  if (st.status !== 'connected') return res.status(409).json({ error: 'session not connected', status: st.status });

  try {
    const r = await client.sendMessage(norm(to), String(message || ''));
    res.json({ ok: true, id: r?.id?._serialized || null });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.listen(PORT, () => console.log(`[wa-gateway] listening on ${PORT}`));
