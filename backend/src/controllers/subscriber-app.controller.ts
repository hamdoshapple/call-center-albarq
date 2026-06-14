import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';

const UPLOAD_DIR = '/app/uploads/subscriber-app';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function safeName(name: string) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  return `${base}-${Date.now()}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, safeName(file.originalname)),
});

export const uploadSubscriberImage = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  },
}).single('file');

export async function uploadImage(req: Request, res: Response) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Image required' });
  }

  res.json({
    success: true,
    fileName: file.filename,
    url: `/uploads/subscriber-app/${file.filename}`,
  });
}

export async function deleteImage(req: Request, res: Response) {
  const fileName = path.basename(String(req.body?.fileName || ''));

  if (!fileName) {
    return res.status(400).json({ error: 'fileName required' });
  }

  const full = path.join(UPLOAD_DIR, fileName);

  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
  }

  res.json({ success: true });
}

export async function getConfig(_req: Request, res: Response) {
  let cfg = await prisma.subscriberAppConfig.findFirst();

  if (!cfg) {
    cfg = await prisma.subscriberAppConfig.create({
      data: {},
    });
  }

  res.json(cfg);
}

export async function updateConfig(req: Request, res: Response) {
  let cfg = await prisma.subscriberAppConfig.findFirst();

  if (!cfg) {
    cfg = await prisma.subscriberAppConfig.create({
      data: {},
    });
  }

  const updated = await prisma.subscriberAppConfig.update({
    where: { id: cfg.id },
    data: req.body,
  });

  res.json(updated);
}

export async function listBanners(_req: Request, res: Response) {
  const rows = await prisma.subscriberAppBanner.findMany({
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  res.json(rows);
}

export async function createBanner(req: Request, res: Response) {
  const row = await prisma.subscriberAppBanner.create({
    data: req.body,
  });

  res.json(row);
}

export async function deleteBanner(req: Request, res: Response) {
  await prisma.subscriberAppBanner.delete({
    where: { id: req.params.id },
  });

  res.json({ success: true });
}
