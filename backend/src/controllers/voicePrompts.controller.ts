import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const SOUND_DIR = '/var/lib/asterisk/sounds/custom';
const MOH_DIR = '/var/lib/asterisk/moh';

const CATEGORIES = [
  'welcome',
  'waiting',
  'hold_music',
  'closed_hours',
  'busy',
  'transfer',
  'transfer_failed',
  'ivr',
  'queue',
  'goodbye',
  'announcement',
  'other',
] as const;

const schema = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  fileName: z.string().min(1),
  url: z.string().default('#'),
  duration: z.number().optional(),
  language: z.string().optional(),
  sizeKb: z.number().optional(),
});

function safeFileName(name: string) {
  const ext = path.extname(name).toLowerCase() || '.wav';
  const base = path.basename(name, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `${base || 'prompt'}-${Date.now()}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(SOUND_DIR, { recursive: true });
    cb(null, SOUND_DIR);
  },
  filename: (_req, file, cb) => cb(null, safeFileName(file.originalname)),
});

export const uploadVoicePrompt = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = /\.(wav|mp3|m4a|aac|mp4|mpeg|gsm|ulaw|alaw)$/i.test(file.originalname);
    const okMime = /^audio\//i.test(file.mimetype) || /mp4|mpeg|aac/i.test(file.mimetype);
    if (!okExt && !okMime) {
      return cb(new Error(`Only audio files are allowed: ${file.originalname} (${file.mimetype})`));
    }
    cb(null, true);
  },
}).single('file');

export async function list(_req: Request, res: Response) {
  const rows = await prisma.voicePrompt.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.voicePrompt.create({
    data: { ...data, duration: data.duration ?? 0, language: data.language ?? 'ar', sizeKb: data.sizeKb ?? 0 },
  });
  res.status(201).json(row);
}

export async function upload(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Audio file is required');

  const category = String(req.body.category || 'other');
  const name = String(req.body.name || path.basename(file.originalname, path.extname(file.originalname)));
  const language = String(req.body.language || 'ar');

  if (!CATEGORIES.includes(category as any)) {
    throw ApiError.badRequest('Invalid prompt category');
  }

  if (category === 'waiting' || category === 'hold_music') {
    fs.mkdirSync(MOH_DIR, { recursive: true });

    for (const old of fs.readdirSync(MOH_DIR)) {
      if (/^albarq-hold-/i.test(old)) {
        fs.unlinkSync(path.join(MOH_DIR, old));
      }
    }

    const mohName = `albarq-hold-${file.filename}`;
    fs.copyFileSync(file.path, path.join(MOH_DIR, mohName));

    try {
      // Asterisk reloads MOH externally; this file is ready for moh reload.
    } catch {}
  }

  const row = await prisma.voicePrompt.create({
    data: {
      name,
      category,
      fileName: file.filename,
      url: `/api/voice-prompts/${file.filename}/audio`,
      duration: Number(req.body.duration || 0),
      language,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
    },
  });

  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Voice prompt not found');
  const row = await prisma.voicePrompt.update({ where: { id: req.params.id }, data });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Voice prompt not found');

  const filePath = path.join(SOUND_DIR, path.basename(existing.fileName));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.voicePrompt.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function audio(req: Request, res: Response) {
  const safeName = path.basename(req.params.fileName);
  const filePath = path.join(SOUND_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const ext = path.extname(safeName).toLowerCase();
  const type =
    ext === '.mp3' ? 'audio/mpeg' :
    ext === '.m4a' || ext === '.mp4' ? 'audio/mp4' :
    ext === '.aac' ? 'audio/aac' :
    'audio/wav';

  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  fs.createReadStream(filePath).pipe(res);
}


const APPLY_TARGETS: Record<string, string> = {
  hold_music: 'hold.wav',
  waiting: 'queue_wait.wav',
  welcome: 'welcome.wav',
  closed_hours: 'closed.wav',
  busy: 'busy.wav',
  transfer: 'transfer.wav',
  transfer_failed: 'transfer_failed.wav',
  ivr: 'ivr_main.wav',
  queue: 'queue_wait.wav',
  goodbye: 'goodbye.wav',
  announcement: 'announcement.wav',
};

async function convertPromptToWav(source: string, targetName: string) {
  const { execFileSync } = await import('node:child_process');
  fs.mkdirSync(MOH_DIR, { recursive: true });

  const target = path.join(MOH_DIR, targetName);

  execFileSync('ffmpeg', [
    '-y',
    '-i', source,
    '-ar', '8000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    target,
  ]);

  return target;
}

export async function applyPrompt(req: Request, res: Response) {
  const row = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!row) throw ApiError.notFound('Voice prompt not found');

  const targetName = APPLY_TARGETS[row.category] || `${row.category}.wav`;

  const source = path.join(SOUND_DIR, path.basename(row.fileName));
  if (!fs.existsSync(source)) {
    return res.status(404).json({ error: 'Source audio file not found', fileName: row.fileName });
  }

  await convertPromptToWav(source, targetName);

  res.json({
    success: true,
    category: row.category,
    fileName: targetName,
    asteriskSound: targetName.replace(/\.wav$/i, ''),
    message: 'Prompt converted and applied. Reload/use dialplan target as needed.',
  });
}

export async function setAsMoh(req: Request, res: Response) {
  const row = await prisma.voicePrompt.findUnique({ where: { id: req.params.id } });
  if (!row) throw ApiError.notFound('Voice prompt not found');

  const source = path.join(SOUND_DIR, path.basename(row.fileName));
  if (!fs.existsSync(source)) {
    return res.status(404).json({ error: 'Source audio file not found', fileName: row.fileName });
  }

  for (const old of fs.readdirSync(MOH_DIR)) {
    const oldPath = path.join(MOH_DIR, old);
    if (fs.statSync(oldPath).isFile()) fs.unlinkSync(oldPath);
  }

  await convertPromptToWav(source, 'hold.wav');

  res.json({
    success: true,
    fileName: 'hold.wav',
    message: 'Converted and applied as Asterisk default MusicOnHold file.',
  });
}
