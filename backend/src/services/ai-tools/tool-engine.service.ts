import { PrismaClient } from '@prisma/client';
import { ensureAiDefaults } from '../ai.service.js';
import { searchExternalSubscribers } from '../external-subscriber.service.js';
import { searchSubscriberCache } from '../subscriber-cache.service.js';

const prisma = new PrismaClient();

type ToolInput = {
  toolKey: string;
  params?: any;
  source?: string;
};

function normPhone(v: unknown) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) d = '0' + d.slice(3);
  if (!d.startsWith('0') && d.length === 10) d = '0' + d;
  return d;
}

function maskPhone(phone?: string) {
  if (!phone) return null;
  const p = String(phone);
  if (p.length < 7) return p;
  return `${p.slice(0, 4)}****${p.slice(-3)}`;
}

function sanitizeSubscriber(row: any, source: string) {
  if (!row) return null;

  return {
    id: row.id || row.externalId || row.subscriberId || null,
    name: row.name || row.fullName || '',
    phone: maskPhone(row.phone || row.mobile || row.phoneNorm || ''),
    pppoeUsername: row.pppoeUsername || row.username || '',
    package: row.package || row.packageName || row.profile || '',
    status: row.status || '',
    debt: Number(row.debt || row.balance || 0),
    expiration: row.expiration || row.expireAt || row.expiresAt || null,
    address: row.address || row.location || '',
    source,
  };
}

async function getFreshSubscriber(q: string) {
  const live = await searchExternalSubscribers(q).catch(() => []);
  if (live?.length) return { source: 'live_sql', row: live[0], rows: live };

  const cached = await searchSubscriberCache(q).catch(() => []);
  if (cached?.length) return { source: 'cache', row: cached[0], rows: cached };

  return { source: 'none', row: null, rows: [] };
}

async function readSubscriber(params: any) {
  const phoneNorm = normPhone(params?.phone || params?.q || params?.query);
  const query = String(params?.query || params?.q || '').trim();

  if (!phoneNorm && !query) {
    return {
      found: false,
      message: 'phone or query is required',
    };
  }

  if (phoneNorm) {
    const aliasRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM SubscriberContactAlias WHERE phoneNorm=? LIMIT 1`,
      phoneNorm
    ).catch(() => []);

    const alias = aliasRows[0] || null;

    if (alias) {
      const key = alias.pppoeUsername || alias.externalId || alias.subscriberId || phoneNorm;
      const fresh = await getFreshSubscriber(String(key));

      return {
        found: Boolean(fresh.row),
        via: 'alias',
        phoneMasked: maskPhone(phoneNorm),
        alias: {
          label: alias.label || null,
          verified: Boolean(alias.verified),
          pppoeUsername: alias.pppoeUsername || null,
          externalId: alias.externalId || null,
          subscriberId: alias.subscriberId || null,
        },
        dataSource: fresh.source,
        subscriber: sanitizeSubscriber(fresh.row, fresh.source),
        accounts: (fresh.rows || []).slice(0, 5).map((x: any) => sanitizeSubscriber(x, fresh.source)),
        lookupOrder: ['subscriber_identity_aliases', 'live_source', 'subscriber_cache'],
      };
    }

    const direct = await getFreshSubscriber(phoneNorm);

    return {
      found: Boolean(direct.row),
      via: direct.row ? 'direct_phone' : 'none',
      phoneMasked: maskPhone(phoneNorm),
      dataSource: direct.source,
      subscriber: sanitizeSubscriber(direct.row, direct.source),
      accounts: (direct.rows || []).slice(0, 5).map((x: any) => sanitizeSubscriber(x, direct.source)),
      lookupOrder: ['direct_live_source', 'subscriber_cache'],
    };
  }

  const direct = await getFreshSubscriber(query);

  return {
    found: Boolean(direct.row),
    via: direct.row ? 'query' : 'none',
    dataSource: direct.source,
    subscriber: sanitizeSubscriber(direct.row, direct.source),
    accounts: (direct.rows || []).slice(0, 5).map((x: any) => sanitizeSubscriber(x, direct.source)),
    lookupOrder: ['live_source', 'subscriber_cache'],
  };
}

async function readTickets(params: any) {
  return {
    found: false,
    message: 'Ticket lookup tool is registered. Real ticket integration will be connected after verifying current ticket schema.',
    params,
  };
}

async function readDebts(params: any) {
  return {
    found: false,
    message: 'Debt lookup tool is registered. Real debt integration will be connected after subscriber resolver.',
    params,
  };
}

async function readCalls(params: any) {
  return {
    found: false,
    message: 'Call lookup tool is registered. Real call lookup will be connected after call log schema review.',
    params,
  };
}

const registry: Record<string, (params: any) => Promise<any>> = {
  read_subscriber: readSubscriber,
  read_tickets: readTickets,
  read_debts: readDebts,
  read_calls: readCalls,
};

export async function runAiTool({ toolKey, params, source = 'manual' }: ToolInput) {
  await ensureAiDefaults();

  const tool = await prisma.aiTool.findUnique({ where: { key: toolKey } });
  if (!tool) throw new Error(`AI tool not found: ${toolKey}`);
  if (!tool.enabled) throw new Error(`AI tool is disabled: ${toolKey}`);
  if (tool.riskLevel !== 'read_only') throw new Error(`Only read_only tools can run now: ${toolKey}`);

  const handler = registry[toolKey];
  if (!handler) {
    throw new Error(`AI tool handler is not implemented yet: ${toolKey}`);
  }

  const started = Date.now();

  try {
    const result = await handler(params || {});

    await prisma.aiLog.create({
      data: {
        source: 'tool',
        skillKey: toolKey,
        success: true,
        latencyMs: Date.now() - started,
        prompt: JSON.stringify({ source, params }),
        response: JSON.stringify(result),
        metaJson: { toolKey, source },
      },
    });

    return {
      tool: {
        key: tool.key,
        title: tool.title,
        riskLevel: tool.riskLevel,
      },
      latencyMs: Date.now() - started,
      result,
    };
  } catch (err: any) {
    await prisma.aiLog.create({
      data: {
        source: 'tool',
        skillKey: toolKey,
        success: false,
        latencyMs: Date.now() - started,
        prompt: JSON.stringify({ source, params }),
        error: err?.message || String(err),
        metaJson: { toolKey, source },
      },
    });

    throw err;
  }
}

export async function listAiToolHandlers() {
  return Object.keys(registry);
}
