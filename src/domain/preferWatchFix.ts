import type { GpsFix } from './types';

/** Signal Lab lock. Stretch only. */
export const WATCH_FIX_MAX_AGE_SEC = 3;

/**
 * Stretch: prefer a Watch GPS fix when it is fresh and at least as accurate as the phone.
 *
 * preferWatch = watchFix
 *   && ageSec <= 3
 *   && watch.accuracyM > 0
 *   && (phoneFix == null || watch.accuracyM <= phone.accuracyM)
 * markFix = preferWatch ? watchFix : phoneFix
 *
 * Never invents a coordinate. Caller still runs acceptFix bands
 * (soft → Approximate; none → wait / Mark anyway).
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
    watchFix &&
      ageSec <= WATCH_FIX_MAX_AGE_SEC &&
      Number(watchFix.accuracyM) > 0 &&
      (phoneFix == null || Number(watchFix.accuracyM) <= Number(phoneFix.accuracyM)),
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
