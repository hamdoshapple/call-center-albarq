import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';

type Action = 'view' | 'create' | 'edit' | 'delete';

/** Guards a route by requiring a permission on a given module. super_admin bypasses all checks. */
export function requirePermission(module: string, action: Action = 'view') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (user.role === 'super_admin') return next();
    const actions = user.permissions[module] ?? [];
    if (!actions.includes(action)) {
      return next(ApiError.forbidden(`Missing permission: ${module}.${action}`));
    }
    next();
  };
}
