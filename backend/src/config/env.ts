import dotenv from 'dotenv';

dotenv.config();

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  // Demo mode keeps the system safe to publish: no real Asterisk credentials are used.
  demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true',
  asterisk: {
    // mock | live — "mock" uses the in-process simulator (default for demo).
    mode: process.env.ASTERISK_MODE ?? 'mock',
    amiHost: process.env.AMI_HOST ?? '127.0.0.1',
    amiPort: num(process.env.AMI_PORT, 5038),
    amiUser: process.env.AMI_USER ?? 'admin',
    amiPassword: process.env.AMI_PASSWORD ?? '',
    ariHost: process.env.ARI_HOST ?? '127.0.0.1',
    ariPort: num(process.env.ARI_PORT, 8088),
    ariUser: process.env.ARI_USER ?? 'asterisk',
    ariPassword: process.env.ARI_PASSWORD ?? '',
  },
};

export const isDemo = env.demoMode || env.asterisk.mode === 'mock';
