import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/jwt.js';

/** Authenticates the request via Bearer token and loads the user's role permissions. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing authorization token');
    }
    const token = header.slice(7);
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.active) throw ApiError.unauthorized('Invalid or inactive user');

    const permissions: Record<string, string[]> = {};
    for (const p of user.role.permissions) {
      permissions[p.module] = (p.actions as string[]) ?? [];
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role.key,
      permissions,
    };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(ApiError.unauthorized('Invalid token'));
  }
}
