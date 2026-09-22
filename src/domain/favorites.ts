import { courseNeedsPinSheets } from './missCard';
import { isValidLatLng, type LatLng } from './latLng';
import { isThunderbirdHeberSpringsIdentity } from '../course/thunderbirdLock';

export const FAVORITES_SETTING_KEY = 'course.favorites';
export const OFFLINE_PACKS_SETTING_KEY = 'course.offline.packs';

export const FAVORITES_BANNER = 'Add your favorite courses here to play without internet.';

export type JsonStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type FavoriteCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  location: LatLng | null;
};

export type OfflinePackStatus = 'downloading' | 'ready' | 'miss';

export type OfflinePack = {
  courseId: string;
  status: OfflinePackStatus;
  updatedAt: string;
};

export type CourseIdentity = {
  courseKey?: string | null;
  courseApiId?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  location?: LatLng | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function point(value: unknown): LatLng | null {
  const record = asRecord(value);
  if (!record) return null;
  const lat = typeof record.lat === 'number' ? record.lat : Number.NaN;
  const lng = typeof record.lng === 'number' ? record.lng : Number.NaN;
  const next = { lat, lng };
  return isValidLatLng(next) ? next : null;
}

export function courseIsHardMiss(course: CourseIdentity): boolean {
  return courseNeedsPinSheets(course) || isThunderbirdHeberSpringsIdentity(course);
}

/** A pin-forced HARD-MISS card is never "Ready offline". */
export function hardMissCanBeReadyOffline(): false {
  return false;
}

export function offlineStatusLabel(status: OfflinePackStatus | null | undefined): string | null {
  if (status === 'downloading') return 'Downloading';
  if (status === 'ready') return 'Ready offline';
  if (status === 'miss') return 'Miss (no map)';
  return null;
}

/** HARD-MISS never displays Ready. A stale ready pack still reads as Miss. */
export function favoriteDisplayedOfflineStatus(
  status: OfflinePackStatus | null | undefined,
  hardMiss: boolean,
): OfflinePackStatus | null {
  if (hardMiss) return status === 'downloading' ? 'downloading' : 'miss';
  return status ?? null;
}

/** Ready hides the download pill. Miss and not-yet-downloaded keep it. */
export function favoriteShowsDownloadPill(status: OfflinePackStatus | null | undefined): boolean {
  return status !== 'ready';
}

export function favoriteReadyChipOnly(status: OfflinePackStatus | null | undefined): boolean {
  return status === 'ready';
}

export function favoriteRowCompact(status: OfflinePackStatus | null | undefined): boolean {
  return status === 'ready';
}

/** Ready rows shrink so more favorites fit. Expanded rows stay content-sized. */
export const FAVORITE_READY_ROW_MIN_HEIGHT = 76;

export function favoriteRowMinHeight(status: OfflinePackStatus | null | undefined): number | null {
  return favoriteRowCompact(status) ? FAVORITE_READY_ROW_MIN_HEIGHT : null;
}

/** Back and a left-edge swipe both go Home. Same pattern for later menus. */
export function favoritesShowsBackButton(): true {
  return true;
}

export function favoritesBackAndSwipeGoHome(): true {
  return true;
}

export const FAVORITES_SWIPE_EDGE_PX = 28;
export const FAVORITES_SWIPE_TRIGGER_PX = 56;

export function favoritesSwipeHomeHref(): '/' {
  return '/';
}

export function favoritesLeftEdgeSwipeGoesHome(args: {
  startX: number;
  dx: number;
  dy: number;
}): boolean {
  if (args.startX > FAVORITES_SWIPE_EDGE_PX) return false;
  if (args.dx < FAVORITES_SWIPE_TRIGGER_PX) return false;
  if (Math.abs(args.dy) > args.dx) return false;
  return true;
}

export type FavoriteRowPressTarget = 'row' | 'star';

/**
 * Anywhere on the favorite row starts the round.
 * The star only toggles the favorite and does not play.
 */
export function favoriteRowPressAction(target: FavoriteRowPressTarget): 'play' | 'toggle' {
  return target === 'star' ? 'toggle' : 'play';
}

/** Top Favorites message is plain text. No card, border, or button chrome. */
export function favoritesBannerChrome(): 'plain' {
  return 'plain';
}

/** A favorite row tap (not the star) starts play through Start Round. */
export function favoriteNameStartsPlay(): true {
  return true;
}

/**
 * Ready only when the waterfall accepted a full card and the course is not HARD-MISS.
 * `paintOk: true` cannot promote Thunderbird.
 */
export function offlineStatusAfterDownload(course: CourseIdentity, paintOk: boolean): 'ready' | 'miss' {
  if (courseIsHardMiss(course) || !paintOk) return 'miss';
  return 'ready';
}

/**
 * Star on a past round uses the same favorites list as the Favorites tab.
 * Location is the stored course pin only. Missing identity stays unstarred.
 */
export function historyStarUsesFavoritesList(): true {
  return true;
}

export function historyStarInventsPaint(): false {
  return false;
}

export function favoriteFromHistoryRound(round: {
  courseApiId?: string | null;
  courseName?: string | null;
  courseLat?: number | null;
  courseLng?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): FavoriteCourse | null {
  const name = text(round.courseName);
  if (!name) return null;
  const id = text(round.courseApiId) ?? `name:${name.toLowerCase()}`;
  const location =
    round.courseLat != null && round.courseLng != null
      ? point({ lat: round.courseLat, lng: round.courseLng })
      : null;
  return {
    id,
    name,
    city: text(round.city),
    state: text(round.state),
    country: text(round.country),
    location,
  };
}

export function favoriteFromSummary(course: {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  location?: LatLng | null;
}): FavoriteCourse | null {
  const id = text(course.id);
  const name = text(course.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    city: text(course.city),
    state: text(course.state),
    country: text(course.country),
    location: isValidLatLng(course.location) ? { lat: course.location.lat, lng: course.location.lng } : null,
  };
}

function parseFavorite(raw: unknown): FavoriteCourse | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = text(record.id);
  const name = text(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    city: text(record.city),
    state: text(record.state),
    country: text(record.country),
    location: point(record.location),
  };
}

export function parseFavorites(raw: string | null | undefined): FavoriteCourse[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: FavoriteCourse[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const favorite = parseFavorite(item);
      if (!favorite || seen.has(favorite.id)) continue;
      seen.add(favorite.id);
      out.push(favorite);
    }
    return out;
  } catch {
    return [];
  }
}

export function listFavorites(store: JsonStore): FavoriteCourse[] {
  return parseFavorites(store.get(FAVORITES_SETTING_KEY));
}

export function isFavorite(store: JsonStore, courseId: string | null | undefined): boolean {
  const id = text(courseId);
  if (!id) return false;
  return listFavorites(store).some((course) => course.id === id);
}

export function setFavorite(store: JsonStore, course: FavoriteCourse, starred: boolean): FavoriteCourse[] {
  const current = listFavorites(store).filter((row) => row.id !== course.id);
  const next = starred ? [course, ...current] : current;
  store.set(FAVORITES_SETTING_KEY, JSON.stringify(next));
  return next;
}

function parsePack(raw: unknown): OfflinePack | null {
  const record = asRecord(raw);
  if (!record) return null;
  const courseId = text(record.courseId);
  const updatedAt = text(record.updatedAt);
  const status = record.status;
  if (!courseId || !updatedAt) return null;
  if (status !== 'downloading' && status !== 'ready' && status !== 'miss') return null;
  return { courseId, status, updatedAt };
}

export function parseOfflinePacks(raw: string | null | undefined): OfflinePack[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: OfflinePack[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const pack = parsePack(item);
      if (!pack || seen.has(pack.courseId)) continue;
      seen.add(pack.courseId);
      out.push(pack);
    }
    return out;
  } catch {
    return [];
  }
}

export function listOfflinePacks(store: JsonStore): OfflinePack[] {
  return parseOfflinePacks(store.get(OFFLINE_PACKS_SETTING_KEY));
}

export function offlinePackFor(store: JsonStore, courseId: string): OfflinePack | null {
  return listOfflinePacks(store).find((pack) => pack.courseId === courseId) ?? null;
}

export function writeOfflinePack(
  store: JsonStore,
  pack: OfflinePack,
): OfflinePack[] {
  const next = [pack, ...listOfflinePacks(store).filter((row) => row.courseId !== pack.courseId)];
  store.set(OFFLINE_PACKS_SETTING_KEY, JSON.stringify(next));
  return next;
}
