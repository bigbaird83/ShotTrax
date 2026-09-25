import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { getCourseDataClient } from '@/src/course/client';
import { coursesForWatchNearby } from '@/src/course/yardTestCourse';
import type { CourseSummary } from '@/src/course/types';
import { downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
import { getActiveRound, readSettingStore } from '@/src/db/repo';
import { listFavorites } from '@/src/domain/favorites';
import { isValidLatLng, type LatLng } from '@/src/domain/latLng';
import type { GpsFix } from '@/src/domain/types';
import {
  WATCH_HOME_LAST_NEARBY_KEY,
  WATCH_HOME_LAST_PHONE_FIX_KEY,
  applyFavoriteToggle,
  buildWatchHome,
  forgetWatchHomeRequestAt,
  parseCachedNearby,
  parseFavoriteToggle,
  parseWatchHomeRequest,
  watchFixFromHomeRequest,
  watchHomeRequestDidApply,
  watchHomeRequestShouldApply,
  watchHomeSearchPoint,
  type WatchHomeLocationSource,
  type WatchHomeMessage,
} from '@/src/domain/watchHome';
import { PHONE_UNAVAILABLE, type ClubPickReply } from '@/src/domain/watchMessages';
import { getCurrentFix, getLastKnownFix } from './location';
import { getLastLiveFix } from './useLiveFix';
import { allowWatchCoursePickDuringRound } from './watchNearby';

export type WatchHomeContext = {
  db: SQLiteDatabase;
  bump: () => void;
  phoneFix: () => GpsFix | null;
  nowMs?: () => number;
};

/** Reply carries the fresh Home so the Watch updates without waiting on a push. */
export type WatchHomeReply = ClubPickReply & { home?: WatchHomeMessage };

let context: WatchHomeContext | null = null;
let lastPushedJson = '';
/** Last nearby search — favorites-only changes re-push without the network. */
let lastNearby: CourseSummary[] = [];
let lastSource: WatchHomeLocationSource = 'none';
let nearbyCacheLoaded = false;
/** A pocketed phone may never answer a GPS wake. Do not hold the Watch reply on it. */
const PHONE_FIX_WAKE_TIMEOUT_MS = 8_000;
const toggleAppliedAt = new Map<string, number>();

export function setWatchHomeContext(next: WatchHomeContext | null): void {
  context = next;
}

function readStoredPhoneFix(db: SQLiteDatabase): LatLng | null {
  try {
    const raw = readSettingStore(db).get(WATCH_HOME_LAST_PHONE_FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatLng;
    return isValidLatLng(parsed) ? { lat: parsed.lat, lng: parsed.lng } : null;
  } catch {
    return null;
  }
}

/** Phone's last known location: live fix (any age) → OS last known → stored. */
async function readLastPhoneFix(db: SQLiteDatabase): Promise<LatLng | null> {
  const live = getLastLiveFix();
  if (isValidLatLng(live)) return { lat: live.lat, lng: live.lng };
  const os = await getLastKnownFix();
  if (isValidLatLng(os)) {
    rememberPhoneFix(db, os);
    return { lat: os.lat, lng: os.lng };
  }
  return readStoredPhoneFix(db);
}

/** Stored so a cold / pocketed phone can still answer Watch Search nearby. */
export function rememberPhoneFix(db: SQLiteDatabase, fix: LatLng | null | undefined): void {
  if (!isValidLatLng(fix)) return;
  try {
    readSettingStore(db).set(
      WATCH_HOME_LAST_PHONE_FIX_KEY,
      JSON.stringify({ lat: fix.lat, lng: fix.lng }),
    );
  } catch {
    // best-effort
  }
}

function loadNearbyCache(db: SQLiteDatabase): void {
  if (nearbyCacheLoaded) return;
  nearbyCacheLoaded = true;
  if (lastNearby.length > 0) return;
  try {
    lastNearby = coursesForWatchNearby(
      parseCachedNearby(readSettingStore(db).get(WATCH_HOME_LAST_NEARBY_KEY)),
    ).map(
      (row): CourseSummary => ({
        id: row.id,
        name: row.name,
        club: null,
        city: null,
        state: null,
        country: null,
        location: null,
        distanceMeters: row.distanceMeters ?? null,
      }),
    );
  } catch {
    lastNearby = [];
  }
}

function saveNearbyCache(db: SQLiteDatabase, rows: CourseSummary[]): void {
  try {
    const kept = coursesForWatchNearby(rows);
    readSettingStore(db).set(
      WATCH_HOME_LAST_NEARBY_KEY,
      JSON.stringify(
        kept.map((row) =>
          row.distanceMeters != null
            ? { id: row.id, name: row.name, distanceMeters: row.distanceMeters }
            : { id: row.id, name: row.name },
        ),
      ),
    );
  } catch {
    // best-effort
  }
}

async function wakePhoneFix(): Promise<GpsFix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getCurrentFix(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PHONE_FIX_WAKE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildFromCache(ctx: WatchHomeContext): WatchHomeMessage {
  loadNearbyCache(ctx.db);
  const active = getActiveRound(ctx.db);
  return buildWatchHome({
    favorites: listFavorites(readSettingStore(ctx.db)),
    nearby: coursesForWatchNearby(lastNearby),
    locationSource: lastSource,
    live: active ? { courseName: active.courseName, courseId: active.courseApiId } : null,
  });
}

async function push(msg: WatchHomeMessage, force = false): Promise<void> {
  const json = JSON.stringify(msg);
  if (!force && json === lastPushedJson) return;
  const mod = getWatchBridgeNative();
  if (!mod) return;
  try {
    if (typeof mod.pushWatchHomeJson === 'function') {
      await mod.pushWatchHomeJson(json);
    } else if (typeof mod.pushWatchMessageJson === 'function') {
      await mod.pushWatchMessageJson(json);
    } else {
      return;
    }
    lastPushedJson = json;
  } catch {
    // Watch is best-effort on Simulator / Android / web.
  }
}

/**
 * Phone favorites (or the live round) changed — re-push Home from the last
 * nearby search. No network. Deduped, so calling it on every DB bump is cheap.
 */
export async function pushWatchHomeFromCache(): Promise<WatchHomeMessage | null> {
  const ctx = context;
  if (!ctx) return null;
  const msg = buildFromCache(ctx);
  await push(msg);
  return msg;
}

async function refreshNearby(
  ctx: WatchHomeContext,
  watchFix: { lat: number; lng: number; timestamp: number } | null,
): Promise<void> {
  const nowMs = () => ctx.nowMs?.() ?? Date.now();
  loadNearbyCache(ctx.db);
  let phoneFix: GpsFix | null = null;
  let lastPhoneFix: LatLng | null = null;
  // Only wake the phone GPS when the Watch has no fresh fix of its own.
  if (!watchHomeSearchPoint({ watchFix, nowMs: nowMs() })) {
    phoneFix = (await wakePhoneFix()) ?? ctx.phoneFix() ?? getLastLiveFix();
    rememberPhoneFix(ctx.db, phoneFix);
    lastPhoneFix = await readLastPhoneFix(ctx.db);
  }
  const chosen = watchHomeSearchPoint({
    watchFix,
    phoneFix,
    lastPhoneFix,
    nowMs: nowMs(),
  });
  if (!chosen) {
    // No location anywhere. A cached list still answers; only no cache is 'none'.
    lastSource = lastNearby.length > 0 ? 'last_phone' : 'none';
    return;
  }
  try {
    lastNearby = await getCourseDataClient().nearbyCourses(chosen.point);
    lastSource = chosen.source;
    saveNearbyCache(ctx.db, lastNearby);
  } catch {
    // Keep the last good list rather than blanking the Watch.
    lastSource = chosen.source;
  }
}

async function handleHomeRequest(raw: unknown): Promise<WatchHomeReply | null> {
  const req = parseWatchHomeRequest(raw);
  if (!req) return null;
  const ctx = context;
  if (!ctx) return { ok: false, feedback: PHONE_UNAVAILABLE };
  // Live sendMessage and the queued transfer share `at`. One nearby search.
  if (!watchHomeRequestShouldApply(req.at)) {
    return { ok: true, feedback: '' };
  }
  // Watch Home → course pick may replace a live round, same as Home → Select course.
  allowWatchCoursePickDuringRound();
  try {
    await refreshNearby(ctx, watchFixFromHomeRequest(req));
    const msg = buildFromCache(ctx);
    await push(msg, true);
    watchHomeRequestDidApply(req.at);
    return { ok: true, feedback: '', home: msg };
  } catch {
    forgetWatchHomeRequestAt(req.at);
    return { ok: false, feedback: PHONE_UNAVAILABLE };
  }
}

async function handleFavoriteToggle(raw: unknown): Promise<WatchHomeReply | null> {
  const toggle = parseFavoriteToggle(raw);
  if (!toggle) return null;
  const ctx = context;
  if (!ctx) return { ok: false, feedback: PHONE_UNAVAILABLE };
  const store = readSettingStore(ctx.db);
  const known = lastNearby.find((course) => course.id === toggle.courseId) ?? null;
  const result = applyFavoriteToggle(store, toggle, { lastAppliedAt: toggleAppliedAt, known });
  if (result.applied) {
    // bump() refreshes every phone screen that lists favorites.
    ctx.bump();
    if (toggle.starred) {
      const saved = result.favorites.find((course) => course.id === toggle.courseId);
      if (saved) void downloadFavoriteForOffline(saved, store, { onStatus: () => ctx.bump() });
    }
  }
  const msg = buildFromCache(ctx);
  await push(msg);
  return { ok: true, feedback: toggle.starred ? 'Favorite ★' : 'Removed', home: msg };
}

export function isWatchHomeJson(json: string): boolean {
  try {
    const raw = JSON.parse(json) as { type?: string };
    return raw?.type === 'homeRequest' || raw?.type === 'favoriteToggle';
  } catch {
    return false;
  }
}

export async function handleWatchHomeJson(json: string): Promise<WatchHomeReply> {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, feedback: PHONE_UNAVAILABLE };
  }
  try {
    return (
      (await handleHomeRequest(raw)) ??
      (await handleFavoriteToggle(raw)) ?? { ok: false, feedback: PHONE_UNAVAILABLE }
    );
  } catch {
    return { ok: false, feedback: PHONE_UNAVAILABLE };
  }
}
