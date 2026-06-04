import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function permsOf(role: { permissions: { module: string; actions: unknown }[] }) {
  const out: Record<string, string[]> = {};
  for (const p of role.permissions) out[p.module] = (p.actions as string[]) ?? [];
  return out;
}

export async function login(req: Request, res: Response) {
  const { username, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !user.active) throw ApiError.unauthorized('Invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const token = signToken({ sub: user.id, username: user.username, role: user.role.key });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role.key,
      roleName: user.role.name,
      permissions: permsOf(user.role),
    },
  });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      role: { include: { permissions: true } },
      agent: { include: { extension: true } },
    },
  });

  if (!user) throw ApiError.notFound('User not found');

  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role.key,
    roleName: user.role.name,
    agentId: user.agent?.id ?? null,
    extension: user.agent?.extension?.number ?? null,
    permissions: permsOf(user.role),
  });
}
