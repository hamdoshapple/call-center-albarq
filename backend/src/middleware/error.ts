import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }
  return res.status(500).json({ error: message });
}
