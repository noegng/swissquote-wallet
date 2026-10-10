// Clients HTTP des services mockés (Swissquote, partenaire). La session Swissquote est gardée en
// mémoire et, si possible, dans sessionStorage (survit à un rechargement de page).
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
    // stockage indisponible (navigation privée) : la session reste en mémoire
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
    throw new Error(`Service ${name} injoignable : lancer \`npm run dev:all\``);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? json.reason ?? `Erreur ${res.status}`);
  return json as T;
}

export const sq = <T = any>(path: string, body?: unknown, token?: string) =>
  call<T>(config.swissquoteUrl, 'Swissquote', path, body, token);

export const partner = <T = any>(path: string, body?: unknown) =>
  call<T>(config.partnerUrl, 'partenaire', path, body);
