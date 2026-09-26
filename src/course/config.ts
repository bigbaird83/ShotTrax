/**
 * Course vendors (Golf Courses API, golfapi.io) are reached only through the
 * share-sync Worker. The Worker holds `GOLF_COURSES_API_KEY` and `GOLFAPI_KEY`
 * as Cloudflare secrets. No vendor key is ever read by, or baked into, the app.
 *
 *   {EXPO_PUBLIC_SHARE_SYNC_URL}/gca/v1/…        → golfcoursesapi.com/api/v1/…
 *   {EXPO_PUBLIC_SHARE_SYNC_URL}/golfapi/v2.3/…  → golfapi.io/api/v2.3/…
 *   {EXPO_PUBLIC_SHARE_SYNC_URL}/osm/v1/overlay  → cached Overpass golf overlay
 *
 * No share-sync URL → course search is the bundled catalog only, paint
 * never calls GCA Pro or golfapi, and overlays go straight to Overpass.
 * Never invents.
 */
export const SHARE_SYNC_URL_EXTRA_KEY = 'shareSyncUrl';
export const GCA_PROXY_PATH = '/gca/v1';
export const GOLFAPI_PROXY_PATH = '/golfapi/v2.3';
export const OSM_OVERLAY_PROXY_PATH = '/osm/v1/overlay';

function trimUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function extraShareSyncUrl(): string | null {
  try {
    // Lazy: node tests must not load react-native via expo-constants.
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
      manifest?: { extra?: Record<string, unknown> };
    };
    return (
      trimUrl(Constants.expoConfig?.extra?.[SHARE_SYNC_URL_EXTRA_KEY]) ??
      trimUrl(Constants.manifest?.extra?.[SHARE_SYNC_URL_EXTRA_KEY])
    );
  } catch {
    return null;
  }
}

/** Share-sync Worker base (`EXPO_PUBLIC_SHARE_SYNC_URL`, then `expo.extra.shareSyncUrl`). */
export function getCourseProxyHost(): string | null {
  return trimUrl(process.env.EXPO_PUBLIC_SHARE_SYNC_URL) ?? extraShareSyncUrl();
}

/** Golf Courses API base through the Worker, or null when no Worker is set. */
export function getGolfCoursesProxyBase(): string | null {
  const host = getCourseProxyHost();
  return host ? `${host}${GCA_PROXY_PATH}` : null;
}

/** golfapi.io base through the Worker, or null when no Worker is set. */
export function getGolfApiProxyBase(): string | null {
  const host = getCourseProxyHost();
  return host ? `${host}${GOLFAPI_PROXY_PATH}` : null;
}

export function isGolfCoursesApiConfigured(): boolean {
  return getGolfCoursesProxyBase() != null;
}
