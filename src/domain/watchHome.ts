/** Watch Home — the default Watch screen when no hole is live.
 *
 * Home body is Favorites. Nearby is not the permanent Home list: a top
 * **Search nearby** button pushes a screen of the same nearby rows.
 * Back pops that push; Home stays mounted so favorites are not dropped.
 *
 * Both lists still come from the phone:
 * - Favorites are the phone's `course.favorites` list. There is no Watch-only list.
 * - Nearby is the same Golf Courses API nearby search the phone Home uses.
 *   Location: a fresh Watch fix when the Watch has one, else a fresh phone fix,
 *   else the last phone location. No location → an empty Nearby, never a guess.
 *
 * A course shows once. A favorite that is also nearby lives under Favorites
 * (with its distance) and is dropped from Nearby, so row ids never repeat.
 *
 * Tapping a row starts the round the same way the phone does (course → holes →
 * tee → Start). Tapping the live round's course continues that round.
 * Search nearby only pushes — it does not start or continue a round.
 * The star toggles the phone favorite and does not start anything.
 * No Export / Restore on the Watch. No cloud account.
 */

import {
  favoriteFromSummary,
  listFavorites,
  setFavorite,
  type FavoriteCourse,
  type JsonStore,
} from './favorites';
import { isValidLatLng, type LatLng } from './latLng';
import type { GpsFix } from './types';
import { NEARBY_COURSE_FIX_MAX_AGE_MS, NEARBY_COURSE_LIST_MAX, OPEN_PHONE } from './watchNearby';
import { isIso8601, PHONE_UNAVAILABLE, QUEUED_WILL_SYNC } from './watchMessages';

/** Home body is Favorites. Nearby is a pushed screen, not the home list. */
export function watchHomeBodyIsFavoritesOnly(): true {
  return true;
}

export function watchHomePermanentlyShowsNearbyList(): false {
  return false;
}

/**
 * Search nearby pushes a screen. It does not start, continue, or replace a round.
 */
export function planWatchHomeSearchNearby(): 'push_nearby' {
  return 'push_nearby';
}

/** Enough to fill a Watch scroll without a search box. */
export const WATCH_HOME_FAVORITES_MAX = 12;

/** Last phone location is stored so a cold phone can still answer the Watch. */
export const WATCH_HOME_LAST_PHONE_FIX_KEY = 'watch.home.lastPhoneFix';

export type WatchHomeCourse = {
  id: string;
  name: string;
  favorite: boolean;
  /** Omitted when unknown — WatchConnectivity payloads cannot carry null. */
  distanceMeters?: number;
};

export type WatchHomeLocationSource = 'watch' | 'phone' | 'last_phone' | 'none';

export type WatchHomeLive = {
  courseName: string;
  courseId?: string;
};

/** Phone → Watch. No null values anywhere (plist-safe). */
export type WatchHomeMessage = {
  type: 'watchHome';
  favorites: WatchHomeCourse[];
  nearby: WatchHomeCourse[];
  locationSource: WatchHomeLocationSource;
  /** Empty-state copy for the Nearby section. Empty string when there are rows. */
  line: string;
  live?: WatchHomeLive;
};

/** Watch → Phone. Ask for a fresh Home. Carries the Watch fix when it has one. */
export type WatchHomeRequest = {
  type: 'homeRequest';
  at: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  /** When the Watch fix was taken (ISO). */
  fixAt?: string;
};

/** Watch → Phone. Explicit target state, so a replay is harmless. */
export type FavoriteToggleMessage = {
  type: 'favoriteToggle';
  courseId: string;
  name: string;
  starred: boolean;
  at: string;
};

export type NearbyInput = {
  id: string;
  name: string;
  distanceMeters?: number | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanDistance(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function row(id: string, name: string, favorite: boolean, distance: number | undefined): WatchHomeCourse {
  return distance === undefined ? { id, name, favorite } : { id, name, favorite, distanceMeters: distance };
}

/**
 * Build Watch Home from the phone favorites + the phone nearby search.
 * Favorites keep phone order (newest star first). Nearby is distance order,
 * minus anything already under Favorites. Every id appears at most once.
 */
export function buildWatchHome(args: {
  favorites: readonly Pick<FavoriteCourse, 'id' | 'name'>[];
  nearby: readonly NearbyInput[];
  locationSource: WatchHomeLocationSource;
  live?: { courseName: string | null; courseId?: string | null } | null;
}): WatchHomeMessage {
  const distanceById = new Map<string, number>();
  for (const course of args.nearby) {
    const id = cleanText(course.id);
    const distance = cleanDistance(course.distanceMeters);
    if (id && distance !== undefined && !distanceById.has(id)) distanceById.set(id, distance);
  }

  const seen = new Set<string>();
  const favorites: WatchHomeCourse[] = [];
  for (const course of args.favorites) {
    const id = cleanText(course.id);
    const name = cleanText(course.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    favorites.push(row(id, name, true, distanceById.get(id)));
    if (favorites.length >= WATCH_HOME_FAVORITES_MAX) break;
  }

  const nearbyRows: WatchHomeCourse[] = [];
  const sorted = [...args.nearby].sort((a, b) => {
    const da = cleanDistance(a.distanceMeters) ?? Number.POSITIVE_INFINITY;
    const db = cleanDistance(b.distanceMeters) ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
  for (const course of sorted) {
    const id = cleanText(course.id);
    const name = cleanText(course.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    nearbyRows.push(row(id, name, false, cleanDistance(course.distanceMeters)));
    if (nearbyRows.length >= NEARBY_COURSE_LIST_MAX) break;
  }

  const msg: WatchHomeMessage = {
    type: 'watchHome',
    favorites,
    nearby: nearbyRows,
    locationSource: args.locationSource,
    line: nearbyRows.length === 0 && favorites.length === 0 ? OPEN_PHONE : '',
  };
  const liveName = cleanText(args.live?.courseName);
  if (liveName) {
    const liveId = cleanText(args.live?.courseId);
    msg.live = liveId ? { courseName: liveName, courseId: liveId } : { courseName: liveName };
  }
  return msg;
}

/** Every row id in render order (Favorites, then Nearby). */
export function watchHomeRowIds(msg: Pick<WatchHomeMessage, 'favorites' | 'nearby'>): string[] {
  return [...msg.favorites.map((c) => c.id), ...msg.nearby.map((c) => c.id)];
}

export function watchHomeHasDuplicateIds(msg: Pick<WatchHomeMessage, 'favorites' | 'nearby'>): boolean {
  const ids = watchHomeRowIds(msg);
  return new Set(ids).size !== ids.length;
}

function fixIsFresh(fix: { timestamp: number } | null | undefined, nowMs: number): boolean {
  if (!fix || !Number.isFinite(fix.timestamp) || fix.timestamp <= 0) return false;
  return nowMs - fix.timestamp <= NEARBY_COURSE_FIX_MAX_AGE_MS;
}

/**
 * Where Watch Home searches from.
 * Fresh Watch fix → fresh phone fix → last phone location (any age) → none.
 * Accuracy is not gated (15 m / 25 m are shot-mark gates only).
 */
export function watchHomeSearchPoint(args: {
  watchFix?: { lat: number; lng: number; timestamp: number } | null;
  phoneFix?: GpsFix | null;
  lastPhoneFix?: LatLng | null;
  nowMs: number;
}): { point: LatLng; source: Exclude<WatchHomeLocationSource, 'none'> } | null {
  if (isValidLatLng(args.watchFix) && fixIsFresh(args.watchFix, args.nowMs)) {
    return { point: { lat: args.watchFix.lat, lng: args.watchFix.lng }, source: 'watch' };
  }
  if (isValidLatLng(args.phoneFix) && fixIsFresh(args.phoneFix, args.nowMs)) {
    return { point: { lat: args.phoneFix.lat, lng: args.phoneFix.lng }, source: 'phone' };
  }
  if (isValidLatLng(args.lastPhoneFix)) {
    return { point: { lat: args.lastPhoneFix.lat, lng: args.lastPhoneFix.lng }, source: 'last_phone' };
  }
  return null;
}

export function parseWatchHomeRequest(raw: unknown): WatchHomeRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'homeRequest') return null;
  if (typeof r.at !== 'string' || !isIso8601(r.at)) return null;
  const out: WatchHomeRequest = { type: 'homeRequest', at: r.at };
  const point = { lat: Number(r.lat), lng: Number(r.lng) };
  if (typeof r.lat === 'number' && typeof r.lng === 'number' && isValidLatLng(point)) {
    out.lat = point.lat;
    out.lng = point.lng;
    if (typeof r.accuracyM === 'number' && Number.isFinite(r.accuracyM)) out.accuracyM = r.accuracyM;
    if (typeof r.fixAt === 'string' && isIso8601(r.fixAt)) out.fixAt = r.fixAt;
  }
  return out;
}

/** Watch fix carried on a Home request, or null. Missing fixAt → not fresh. */
export function watchFixFromHomeRequest(
  req: WatchHomeRequest,
): { lat: number; lng: number; timestamp: number } | null {
  if (req.lat == null || req.lng == null || !req.fixAt) return null;
  return { lat: req.lat, lng: req.lng, timestamp: Date.parse(req.fixAt) };
}

export function parseFavoriteToggle(raw: unknown): FavoriteToggleMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'favoriteToggle') return null;
  const courseId = cleanText(r.courseId);
  const name = cleanText(r.name);
  if (!courseId || !name) return null;
  if (typeof r.starred !== 'boolean') return null;
  if (typeof r.at !== 'string' || !isIso8601(r.at)) return null;
  return { type: 'favoriteToggle', courseId, name, starred: r.starred, at: r.at };
}

export function favoriteTogglePayload(args: {
  courseId: string;
  name: string;
  starred: boolean;
  at?: string;
}): FavoriteToggleMessage {
  return {
    type: 'favoriteToggle',
    courseId: args.courseId,
    name: args.name,
    starred: args.starred,
    at: args.at ?? new Date().toISOString(),
  };
}

/**
 * Apply a Watch star to the phone favorites list — the same `course.favorites`
 * setting the phone Favorites tab, course picker, and history star write.
 *
 * `lastAppliedAt` holds the newest toggle time per course. A Watch toggle is
 * sent twice (live message + queued transfer), and the two can land out of
 * order; an older toggle never overrides a newer one.
 *
 * `known` is the richest record the phone has for that id (nearby summary),
 * so a star from the Watch saves city/state/pin like a phone star does.
 */
export function applyFavoriteToggle(
  store: JsonStore,
  toggle: FavoriteToggleMessage,
  opts: {
    lastAppliedAt: Map<string, number>;
    known?: Parameters<typeof favoriteFromSummary>[0] | null;
  },
): { applied: boolean; favorites: FavoriteCourse[] } {
  const atMs = Date.parse(toggle.at);
  const prior = opts.lastAppliedAt.get(toggle.courseId);
  if (prior != null && atMs < prior) {
    return { applied: false, favorites: listFavorites(store) };
  }
  opts.lastAppliedAt.set(toggle.courseId, atMs);

  const current = listFavorites(store);
  const already = current.some((course) => course.id === toggle.courseId);
  if (already === toggle.starred) return { applied: false, favorites: current };

  const record =
    (opts.known && opts.known.id === toggle.courseId ? favoriteFromSummary(opts.known) : null) ??
    current.find((course) => course.id === toggle.courseId) ??
    ({
      id: toggle.courseId,
      name: toggle.name,
      city: null,
      state: null,
      country: null,
      location: null,
    } satisfies FavoriteCourse);
  return { applied: true, favorites: setFavorite(store, record, toggle.starred) };
}

/** Tapping the live round's course on Watch Home goes back to that hole. */
export function planWatchHomeTap(args: {
  course: { id: string; name: string };
  live?: WatchHomeLive | null;
  hasLiveHole: boolean;
}): 'continue_round' | 'pick_course' {
  if (!args.hasLiveHole || !args.live) return 'pick_course';
  if (args.live.courseId && args.live.courseId === args.course.id) return 'continue_round';
  if (args.live.courseName.trim().toLowerCase() === args.course.name.trim().toLowerCase()) {
    return 'continue_round';
  }
  return 'pick_course';
}

/** Watch Home is not a place for backups. */
export function watchHomeShowsExportRestore(): false {
  return false;
}

/**
 * Pocketed / backgrounded phone: homeRequest rides `transferUserInfo`
 * (same transport as `sendReliableQueued`). Never an interactive poll.
 */
export function watchHomeSyncWhenUnreachable(): 'transferUserInfo' {
  return 'transferUserInfo';
}

export function watchHomeSendMessageWhenUnreachable(): false {
  return false;
}

/** Wrist raise and reachability flaps must not wake the phone with sendMessage. */
export function watchHomeBackgroundRefreshUsesSendMessage(): false {
  return false;
}

/** Loud wrist copy while that transfer is waiting. Not Phone unavailable. */
export function watchHomeQueuedCopy(): typeof QUEUED_WILL_SYNC {
  return QUEUED_WILL_SYNC;
}

export function watchHomeUnavailableCopy(): typeof PHONE_UNAVAILABLE {
  return PHONE_UNAVAILABLE;
}

export type WatchHomeRefreshFace = 'home' | 'nearby';

/**
 * What Home / Search nearby say during a refresh.
 * Unreachable + in flight → Queued · will sync on both faces.
 * Reachable + in flight → Updating… (Home) or Finding courses… (empty Nearby).
 */
export function watchHomeRefreshStatus(args: {
  phoneReachable: boolean;
  loading: boolean;
  nearbyEmpty: boolean;
  face: WatchHomeRefreshFace;
  line?: string;
}): string {
  if (args.loading && !args.phoneReachable) return QUEUED_WILL_SYNC;
  if (args.face === 'nearby' && args.nearbyEmpty) {
    if (args.loading) return 'Finding courses…';
    const line = args.line?.trim() ?? '';
    return line.length > 0 ? line : OPEN_PHONE;
  }
  if (args.loading) return 'Updating…';
  return 'Refresh';
}

/**
 * sendMessage and transferUserInfo share one homeRequest `at`. Run the nearby
 * search once so the live reply and the queued transfer cannot each wake GPS.
 * A failed attempt is forgotten so the queue can retry that `at`.
 */
const homeRequestApplied = new Set<string>();
const homeRequestInflight = new Set<string>();

export function watchHomeRequestShouldApply(at: string): boolean {
  if (!at) return true;
  if (homeRequestApplied.has(at) || homeRequestInflight.has(at)) return false;
  homeRequestInflight.add(at);
  return true;
}

export function watchHomeRequestDidApply(at: string): void {
  homeRequestInflight.delete(at);
  if (at) homeRequestApplied.add(at);
}

export function forgetWatchHomeRequestAt(at: string): void {
  homeRequestInflight.delete(at);
  homeRequestApplied.delete(at);
}

/** Favorites are one list, owned by the phone settings store. */
export function watchKeepsOwnFavoritesList(): false {
  return false;
}
