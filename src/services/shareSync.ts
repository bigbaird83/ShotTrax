import Constants from 'expo-constants';
import type { SpectatorPayload } from '../domain/spectator';
import { parseSpectatorPayload } from '../domain/spectator';

/**
 * Optional JSON PUT/GET store for the same share token.
 * Payload-in-URL already works without this. Live refresh of one link
 * needs a base URL (EXPO_PUBLIC_SHARE_SYNC_URL).
 */
export function getShareSyncUrl(): string | null {
  const extra =
    Constants.expoConfig?.extra && typeof Constants.expoConfig.extra === 'object'
      ? (Constants.expoConfig.extra as Record<string, unknown>)
      : {};
  const candidates = [
    process.env.EXPO_PUBLIC_SHARE_SYNC_URL,
    typeof extra.shareSyncUrl === 'string' ? extra.shareSyncUrl : null,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\/+$/, '');
  }
  return null;
}

export async function putSharedPayload(
  token: string,
  payload: SpectatorPayload,
  deps: { fetch?: typeof fetch; baseUrl?: string | null } = {},
): Promise<boolean> {
  const base = deps.baseUrl === undefined ? getShareSyncUrl() : deps.baseUrl;
  if (!base || !token.trim()) return false;
  const fetchImpl = deps.fetch ?? fetch;
  try {
    const res = await fetchImpl(`${base}/${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSharedPayload(
  token: string,
  deps: { fetch?: typeof fetch; baseUrl?: string | null } = {},
): Promise<SpectatorPayload | null> {
  const base = deps.baseUrl === undefined ? getShareSyncUrl() : deps.baseUrl;
  if (!base || !token.trim()) return null;
  const fetchImpl = deps.fetch ?? fetch;
  try {
    const res = await fetchImpl(`${base}/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return parseSpectatorPayload(await res.json());
  } catch {
    return null;
  }
}
