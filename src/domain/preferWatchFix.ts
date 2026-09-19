import type { GpsFix } from './types';

/** Watch club tap may attach a sample this fresh. Stale → phone fallback. */
export const WATCH_FIX_MAX_AGE_SEC = 3;

/**
 * Watch club tap → Watch GPS when the sample is fresh and valid.
 * Phone tap passes no watchFix and uses the phone.
 * Missing / stale / accuracy≤0 Watch sample falls back to phone.
 * Never invents a coordinate. Caller still runs acceptFix bands
 * (soft → Approximate; none → wait / Mark anyway).
 *
 * preferWatch = watchFix && ageSec <= 3 && watch.accuracyM > 0
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
  const preferWatch = Boolean(
    watchFix && ageSec <= WATCH_FIX_MAX_AGE_SEC && Number(watchFix.accuracyM) > 0,
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
