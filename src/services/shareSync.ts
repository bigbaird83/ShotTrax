import Constants from 'expo-constants';
import type { SpectatorPayload } from '../domain/spectator';
import { fetchSharedBoard, putSharedBoard, type SharedBoardFetch } from '../domain/shareBoardSync';

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
  return putSharedBoard(token, payload, {
    fetch: deps.fetch ?? fetch,
    baseUrl: deps.baseUrl === undefined ? getShareSyncUrl() : deps.baseUrl,
  });
}

/** Board lookup with the miss / error distinction the spectator screen needs. */
export async function loadSharedPayload(
  token: string,
  deps: { fetch?: typeof fetch; baseUrl?: string | null } = {},
): Promise<SharedBoardFetch> {
  return fetchSharedBoard(token, {
    fetch: deps.fetch ?? fetch,
    baseUrl: deps.baseUrl === undefined ? getShareSyncUrl() : deps.baseUrl,
  });
}

export async function getSharedPayload(
  token: string,
  deps: { fetch?: typeof fetch; baseUrl?: string | null } = {},
): Promise<SpectatorPayload | null> {
  const result = await loadSharedPayload(token, deps);
  return result.status === 'ok' ? result.payload : null;
}
