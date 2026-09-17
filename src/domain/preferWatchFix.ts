import type { GpsFix } from './types';

const WATCH_FIX_MAX_AGE_SEC = 3;

/**
 * Stretch: prefer a Watch GPS fix when it is fresh and at least as accurate as the phone.
 * `preferWatch = watchFix && ageSec <= 3 && watch.accuracyM > 0
 *   && (phoneFix == null || watch.accuracyM <= phone.accuracyM)`
 * Never invents a coordinate. Caller still runs acceptFix bands.
 */
export function preferWatchFix(args: {
  watchFix: GpsFix | null;
  phoneFix: GpsFix | null;
  nowMs?: number;
}): { fix: GpsFix | null; usedWatch: boolean } {
  const now = args.nowMs ?? Date.now();
  const watch = args.watchFix;
  const phone = args.phoneFix;
  const ageSec = watch ? (now - watch.timestamp) / 1000 : Number.POSITIVE_INFINITY;
  const preferWatch =
    watch != null &&
    Number.isFinite(ageSec) &&
    ageSec <= WATCH_FIX_MAX_AGE_SEC &&
    watch.accuracyM != null &&
    watch.accuracyM > 0 &&
    (phone == null ||
      (phone.accuracyM != null && watch.accuracyM <= phone.accuracyM));
  if (preferWatch && watch) {
    return { fix: watch, usedWatch: true };
  }
  return { fix: phone, usedWatch: false };
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
