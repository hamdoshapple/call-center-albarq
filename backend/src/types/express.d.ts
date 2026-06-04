import 'express';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      username: string;
      role: string; // role key
      permissions: Record<string, string[]>; // module -> actions
    }
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
