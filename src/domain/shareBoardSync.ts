import { normalizeShareBoardCode } from './liveBoard';
import { parseSpectatorPayload, type SpectatorPayload } from './spectator';

/**
 * Share-host (EXPO_PUBLIC_SHARE_SYNC_URL) PUT/GET. The publisher and every
 * spectator path — typed code, `/s/{code}` deep link — hit the same
 * `{base}/{normalized code}` URL.
 */
export type SharedBoardFetch =
  | { status: 'ok'; payload: SpectatorPayload }
  | { status: 'miss' }
  | { status: 'error' }
  | { status: 'no-host' };

type Deps = { fetch: typeof fetch; baseUrl: string | null };

export function shareBoardUrl(baseUrl: string, token: string): string | null {
  const key = normalizeShareBoardCode(token);
  if (!key) return null;
  return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(key)}`;
}

/**
 * Accepts the board JSON as the player PUT it, or wrapped by the host
 * (`{ payload }`, `{ data }`, `{ value }`, or a JSON string). A body that
 * lost its `token` gets the looked-up code.
 */
export function parseSharedBoardBody(raw: unknown, code: string): SpectatorPayload | null {
  let value = raw;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        return null;
      }
      continue;
    }
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
    const rec = value as Record<string, unknown>;
    if (Array.isArray(rec.holes)) {
      const token = typeof rec.token === 'string' && rec.token.trim() ? rec.token : code;
      return parseSpectatorPayload({ ...rec, token });
    }
    const inner = rec.payload ?? rec.data ?? rec.value ?? rec.board;
    if (inner === undefined) return null;
    value = inner;
  }
  return null;
}

export async function putSharedBoard(
  token: string,
  payload: SpectatorPayload,
  deps: Deps,
): Promise<boolean> {
  const url = deps.baseUrl ? shareBoardUrl(deps.baseUrl, token) : null;
  if (!url) return false;
  const key = normalizeShareBoardCode(token) ?? token;
  try {
    const res = await deps.fetch(url, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSharedBoard(token: string, deps: Deps): Promise<SharedBoardFetch> {
  if (!deps.baseUrl) return { status: 'no-host' };
  const url = shareBoardUrl(deps.baseUrl, token);
  const key = normalizeShareBoardCode(token);
  if (!url || !key) return { status: 'miss' };
  try {
    const res = await deps.fetch(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    if (res.status === 404) return { status: 'miss' };
    if (!res.ok) return { status: 'error' };
    const text = await res.text();
    if (!text.trim()) return { status: 'miss' };
    const payload = parseSharedBoardBody(text, key);
    return payload ? { status: 'ok', payload } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
