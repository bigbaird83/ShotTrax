import { classifyAccuracyM } from './fixQuality';
import type { GpsFix } from './types';

/** Watch club tap may attach a sample this fresh. Stale → phone fallback. */
export const WATCH_FIX_MAX_AGE_SEC = 3;

/**
 * Watch club tap → Watch GPS only when the sample is fresh and inside the
 * same 15 m / 25 m gates as acceptFix (good or soft). Phone tap passes no
 * watchFix and uses the phone. Missing / stale / poor Watch sample falls
 * back to phone. Never invents a coordinate. The 600-yard tee check runs
 * on whichever fix is saved.
 *
 * preferWatch = watchFix
 *   && ageSec <= 3
 *   && accuracyM > 0
 *   && classifyAccuracyM(accuracyM) !== 'poor'
 * markFix = preferWatch ? watchFix : phoneFix
 */
export function preferWatchFix(args: {
  watchFix: GpsFix | null;
  phoneFix: GpsFix | null;
  nowMs?: number;
}): { fix: GpsFix | null; usedWatch: boolean } {
  const now = args.nowMs ?? Date.now();
  const watchFix = args.watchFix;
  const phoneFix = args.phoneFix;
  const ageSec = watchFix != null ? (now - watchFix.timestamp) / 1000 : Number.POSITIVE_INFINITY;
  const watchClass = watchFix ? classifyAccuracyM(watchFix.accuracyM) : 'poor';
  const preferWatch = Boolean(
    watchFix &&
      ageSec <= WATCH_FIX_MAX_AGE_SEC &&
      Number(watchFix.accuracyM) > 0 &&
      watchClass !== 'poor',
  );
  const markFix = preferWatch ? watchFix : phoneFix;
  return { fix: markFix, usedWatch: preferWatch };
}

export function watchFixFromPick(pick: {
  lat?: number;
  lng?: number;
  accuracyM?: number | null;
  at: string;
}): GpsFix | null {
  if (pick.lat == null || pick.lng == null) return null;
  if (!Number.isFinite(pick.lat) || !Number.isFinite(pick.lng)) return null;
  const parsed = Date.parse(pick.at);
  return {
    lat: pick.lat,
    lng: pick.lng,
    accuracyM: pick.accuracyM ?? null,
    mocked: false,
    isSimulator: false,
    timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
  };
}
