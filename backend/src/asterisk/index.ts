import { env } from '../config/env.js';
import { LiveAsteriskGateway } from './live.js';
import { MockAsteriskGateway } from './mock.js';
import type { AsteriskGateway } from './types.js';

let gateway: AsteriskGateway | null = null;

/** Returns the singleton Asterisk gateway, choosing mock vs live from config. */
export function getAsteriskGateway(): AsteriskGateway {
  if (gateway) return gateway;
  gateway = env.asterisk.mode === 'live' ? new LiveAsteriskGateway() : new MockAsteriskGateway();
  return gateway;
}

export type { AsteriskGateway } from './types.js';
export * from './types.js';
