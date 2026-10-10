// Client HTTP du service Swissquote mocké. La session est gardée en mémoire et, si possible,
// dans sessionStorage (confort de développement : survit à un rechargement de page).
const SQ_URL = `http://localhost:${import.meta.env.VITE_SWISSQUOTE_PORT ?? 4001}`;

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

export async function sq<T = any>(path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(SQ_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Service Swissquote injoignable : lancer `npm run dev:all`');
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? json.reason ?? `Erreur ${res.status}`);
  return json as T;
}
