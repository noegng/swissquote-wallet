// Small HTTP client of the mocked services for the scripts (returns the status and the JSON, never throws).
import { join } from 'node:path';

try {
  process.loadEnvFile(join(import.meta.dirname, '../../.env'));
} catch {}

export const SQ = `http://localhost:${process.env.SWISSQUOTE_PORT ?? 4001}`;
export const PARTNER = `http://localhost:${process.env.PARTNER_PORT ?? 4002}`;
export const ORIGIN = process.env.ORIGIN?.split(',')[0];
export const RP_ID = process.env.RP_ID;

export async function call(method: 'GET' | 'POST', url: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { code: res.status, json: (await res.json()) as any };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
