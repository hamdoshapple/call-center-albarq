import 'express';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      username: string;
      role: string; // role key
      agentId?: string | null;
      extension?: string | null;
      permissions: Record<string, string[]>; // module -> actions
    }
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
