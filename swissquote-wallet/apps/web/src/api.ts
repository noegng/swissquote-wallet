// HTTP clients of the mocked services (Swissquote, partner). The Swissquote session is kept in
// memory and, when possible, in sessionStorage (survives a page reload).
import { config } from './config';

export interface Session {
  token: string;
  clientId: string;
  hasPasskey: boolean;
}

const KEY = 'sqw.session';

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable (private browsing): the session stays in memory
  }
}

/** Error returned by a service: keeps the HTTP status to tell a refusal (403, 423) from an outage. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(base: string, name: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`${name} service unreachable: run \`npm run dev:all\``);
  }
  const json = await res.json();
  if (!res.ok) throw new ApiError(json.error ?? json.reason ?? `Error ${res.status}`, res.status);
  return json as T;
}

export const sq = <T = any>(path: string, body?: unknown, token?: string) =>
  call<T>(config.swissquoteUrl, 'Swissquote', path, body, token);

export const partner = <T = any>(path: string, body?: unknown) =>
  call<T>(config.partnerUrl, 'Partner', path, body);
