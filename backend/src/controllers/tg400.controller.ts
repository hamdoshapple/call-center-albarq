import type { Request, Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';

const execFileAsync = promisify(execFile);
const TG400_IP = process.env.TG400_IP || '192.168.0.6';

const schema = z.object({
  slot: z.number(),
  number: z.string().min(1),
  carrier: z.string().optional(),
  status: z.enum(['active', 'inactive', 'no_sim', 'error']).optional(),
  signal: z.number().min(0).max(100).optional(),
  purpose: z.string().optional(),
  inboundRoute: z.string().optional(),
  outboundRoute: z.string().optional(),
  balance: z.number().optional(),
});

function serialize(l: {
  id: string; slot: number; number: string; carrier: string | null; status: string; signal: number;
  purpose: string | null; inboundRoute: string; outboundRoute: string; balance: number;
  usageCalls: number; usageMinutes: number; usageCost: number;
}) {
  return {
    id: l.id, slot: l.slot, number: l.number, carrier: l.carrier ?? '', status: l.status, signal: l.signal,
    purpose: l.purpose ?? '', inboundRoute: l.inboundRoute, outboundRoute: l.outboundRoute, balance: l.balance,
    usage: { calls: l.usageCalls, minutes: l.usageMinutes, cost: l.usageCost },
  };
}

export async function list(_req: Request, res: Response) {
  const rows = await prisma.tg400Line.findMany({ orderBy: { slot: 'asc' } });
  res.json(rows.map(serialize));
}

export async function create(req: Request, res: Response) {
  const data = schema.parse(req.body);
  const row = await prisma.tg400Line.create({
    data: {
      slot: data.slot, number: data.number, carrier: data.carrier, status: data.status ?? 'no_sim',
      signal: data.signal ?? 0, purpose: data.purpose, inboundRoute: data.inboundRoute ?? '-',
      outboundRoute: data.outboundRoute ?? '-', balance: data.balance ?? 0,
    },
  });
  res.status(201).json(serialize(row));
}

export async function update(req: Request, res: Response) {
  const data = schema.partial().parse(req.body);
  const existing = await prisma.tg400Line.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Line not found');
  const row = await prisma.tg400Line.update({ where: { id: req.params.id }, data });
  res.json(serialize(row));
}

export async function remove(req: Request, res: Response) {
  const existing = await prisma.tg400Line.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Line not found');
  await prisma.tg400Line.delete({ where: { id: req.params.id } });
  res.status(204).end();
}


async function shell(cmd: string, args: string[] = []) {
  try {
    const r = await execFileAsync(cmd, args, { timeout: 2500 });
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  } catch (e: any) {
    return { ok: false, stdout: e?.stdout?.trim?.() || '', stderr: e?.stderr?.trim?.() || e?.message || '' };
  }
}

async function httpCheck(ip: string) {
  const started = Date.now();
  return await new Promise<{ ok: boolean; latencyMs: number | null; statusCode: number | null }>((resolve) => {
    const req = http.request({ host: ip, port: 80, method: 'HEAD', path: '/', timeout: 2500 }, (res) => {
      res.resume();
      resolve({ ok: true, latencyMs: Date.now() - started, statusCode: res.statusCode ?? null });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, latencyMs: null, statusCode: null }); });
    req.on('error', () => resolve({ ok: false, latencyMs: null, statusCode: null }));
    req.end();
  });
}

export async function live(_req: Request, res: Response) {
  const ip = TG400_IP;

  const [route, ppp, web, contacts] = await Promise.all([
    shell('/usr/bin/nsenter', ['-t', '1', '-n', '/usr/sbin/ip', 'route', 'get', ip]),
    shell('/usr/bin/nsenter', ['-t', '1', '-n', '/usr/sbin/ip', '-o', 'addr', 'show']),
    httpCheck(ip),
    shell('/usr/sbin/asterisk', ['-rx', 'pjsip show contacts']),
  ]);

  const routeText = route.stdout || '';
  const iface = (routeText.match(/\bdev\s+(\S+)/)?.[1]) || '';
  const routeOk = routeText.includes('192.168.0.6') && routeText.includes('dev ppp0');

  const pppLines = (ppp.stdout || '')
    .split('\n')
    .filter((x: string) => x.includes(' ppp'))
    .map((x: string) => x.trim());

  const contactsText = contacts.stdout || '';
  const sip20001 =
    contactsText.split('\n').find((x: string) => x.includes('20001'))?.trim() || '';

  res.json({
    gateway: {
      ip,
      online: web.ok,
      latencyMs: web.latencyMs,
      httpStatus: web.statusCode,
    },
    vpn: {
      routeOk,
      interface: iface,
      route: routeText,
      ppp: pppLines,
    },
    sip: {
      endpoint: '20001',
      registered: /Avail/i.test(sip20001),
      raw: sip20001,
    },
    checkedAt: new Date().toISOString(),
  });
}

