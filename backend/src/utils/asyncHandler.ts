import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps an async route handler so thrown errors are forwarded to Express error middleware. */
export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
