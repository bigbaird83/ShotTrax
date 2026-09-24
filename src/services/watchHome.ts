import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { getCourseDataClient } from '@/src/course/client';
import type { CourseSummary } from '@/src/course/types';
import { downloadFavoriteForOffline } from '@/src/course/offlineFavorite';
import { getActiveRound, readSettingStore } from '@/src/db/repo';
import { listFavorites } from '@/src/domain/favorites';
import { isValidLatLng, type LatLng } from '@/src/domain/latLng';
import type { GpsFix } from '@/src/domain/types';
import {
  WATCH_HOME_LAST_PHONE_FIX_KEY,
  applyFavoriteToggle,
  buildWatchHome,
  forgetWatchHomeRequestAt,
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
import { getCurrentFix } from './location';
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
const toggleAppliedAt = new Map<string, number>();

export function setWatchHomeContext(next: WatchHomeContext | null): void {
  context = next;
}

function readLastPhoneFix(db: SQLiteDatabase): LatLng | null {
  const live = getLastLiveFix();
  if (isValidLatLng(live)) return { lat: live.lat, lng: live.lng };
  try {
    const raw = readSettingStore(db).get(WATCH_HOME_LAST_PHONE_FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatLng;
    return isValidLatLng(parsed) ? { lat: parsed.lat, lng: parsed.lng } : null;
  } catch {
    return null;
  }
}

function rememberPhoneFix(db: SQLiteDatabase, fix: GpsFix | null): void {
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

function buildFromCache(ctx: WatchHomeContext): WatchHomeMessage {
  const active = getActiveRound(ctx.db);
  return buildWatchHome({
    favorites: listFavorites(readSettingStore(ctx.db)),
    nearby: lastNearby,
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
  let phoneFix: GpsFix | null = null;
  // Only wake the phone GPS when the Watch has no fresh fix of its own.
  if (!watchHomeSearchPoint({ watchFix, nowMs: nowMs() })) {
    try {
      phoneFix = await getCurrentFix();
    } catch {
      phoneFix = ctx.phoneFix() ?? getLastLiveFix();
    }
    rememberPhoneFix(ctx.db, phoneFix);
  }
  const chosen = watchHomeSearchPoint({
    watchFix,
    phoneFix,
    lastPhoneFix: readLastPhoneFix(ctx.db),
    nowMs: nowMs(),
  });
  if (!chosen) {
    lastSource = 'none';
    return;
  }
  try {
    lastNearby = await getCourseDataClient().nearbyCourses(chosen.point);
    lastSource = chosen.source;
  } catch {
    // Keep the last good list rather than blanking the Watch.
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
