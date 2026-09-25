import { isPutterClubId } from './defaultBag';
import { isCourseCardLatLng, type LatLng } from './latLng';
import { planLiveGpsToPin, type LiveGpsToPin } from './yardsToGreen';

/**
 * Pocketed-phone live yards.
 *
 * The phone only has when-in-use location, so a locked phone never re-renders
 * and `useWatchClubList` never pushes. The Watch already has a fix during the
 * golf workout. It runs `planLiveGpsToPin` against the course green the phone
 * sent (`greenLat` / `greenLng` — the same point the phone passes in) and
 * drives the on-screen number, the complication, and the club window from that.
 *
 * `targets/watch/WatchClubSession.swift` `liveYards` / `phoneLiveShouldReplace`
 * / `reloadWidgetIfNeeded` mirror the helpers below. Do not drift the
 * accuracy thresholds (15 m / 25 m / 600 yd). Complication reloads are a
 * separate budget: ≥1 yd and at least 45 s, or an immediate hole change.
 */

/**
 * Complication reload budget. WidgetKit allows roughly 40–70 refreshes a day.
 * Hole changes reload immediately. Any other displayed-yard change must be at
 * least 1 yard and must wait out 45 seconds. The in-app number is not gated.
 */
export const WATCH_WIDGET_RELOAD_MIN_YD = 1;
export const WATCH_WIDGET_RELOAD_MIN_MS = 45_000;

/** Background GPS during the golf workout. Must ship with allowsBackgroundLocationUpdates. */
export function watchLiveLocationBackgroundMode(): 'location' {
  return 'location';
}

/** Wrist-down walking filter. Wrist-up stays unfiltered so a club mark stays under 3 s. */
export const WATCH_LIVE_DISTANCE_FILTER_M = 3;

export const WATCH_LOCATION_WHEN_IN_USE =
  'ShotTraxx™ uses your Apple Watch location during a round to show yards to the green as you walk, and when you pick a club to mark where you hit from.';

export type WatchGreenFields = {
  greenLat: number;
  greenLng: number;
  greenFrontLat?: number;
  greenFrontLng?: number;
  greenBackLat?: number;
  greenBackLng?: number;
};

/**
 * The cup `planLiveGpsToPin` uses, plus front/back when the phone already has
 * them. No course point → null. Never the phone's own location, never 0,0.
 */
export function watchGreenFields(args: {
  green: LatLng | null | undefined;
  front?: LatLng | null;
  back?: LatLng | null;
}): WatchGreenFields | null {
  if (!isCourseCardLatLng(args.green)) return null;
  const fields: WatchGreenFields = { greenLat: args.green.lat, greenLng: args.green.lng };
  if (isCourseCardLatLng(args.front)) {
    fields.greenFrontLat = args.front.lat;
    fields.greenFrontLng = args.front.lng;
  }
  if (isCourseCardLatLng(args.back)) {
    fields.greenBackLat = args.back.lat;
    fields.greenBackLng = args.back.lng;
  }
  return fields;
}

/** Bag carries the play wheel ranks with (`planClubStrip` / `resolveWheelCarries`). Putter omitted. */
export function watchClubCarry(
  carries: Record<string, number | null | undefined> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!carries) return out;
  for (const [id, yards] of Object.entries(carries)) {
    if (!id || isPutterClubId(id)) continue;
    if (yards == null || !Number.isFinite(yards) || yards <= 0) continue;
    out[id] = Math.round(yards);
  }
  return out;
}

/**
 * Same bands as the phone corner badge. Poor accuracy, no green, or over
 * 600 yd → no number. The Watch calls this shape on every `didUpdateLocations`.
 */
export function planWatchLiveYards(args: {
  fix: { lat: number; lng: number; accuracyM: number | null } | null;
  green: LatLng | null | undefined;
}): LiveGpsToPin {
  if (!args.fix) return planLiveGpsToPin({ fix: null, green: args.green });
  return planLiveGpsToPin({
    fix: {
      lat: args.fix.lat,
      lng: args.fix.lng,
      accuracyM: args.fix.accuracyM,
      mocked: false,
      isSimulator: false,
      timestamp: 0,
    },
    green: args.green,
  });
}

/**
 * A phone clubList may be an old application context delivered late.
 * The phone wins only when its fix is newer than the yards the Watch already
 * computed for this same hole. A new hole always accepts the phone.
 * A phone payload with no timestamp cannot clobber a Watch computation.
 */
export function phoneLiveShouldReplaceWatch(args: {
  phoneHole: number;
  phoneAtMs: number | null;
  watchHole: number | null;
  watchAtMs: number | null;
}): boolean {
  if (
    args.watchHole == null ||
    args.watchAtMs == null ||
    !Number.isFinite(args.watchAtMs) ||
    args.watchAtMs <= 0 ||
    args.phoneHole !== args.watchHole
  ) {
    return true;
  }
  if (args.phoneAtMs == null || !Number.isFinite(args.phoneAtMs) || args.phoneAtMs <= 0) return false;
  return args.phoneAtMs > args.watchAtMs;
}

export function watchWidgetShouldReload(args: {
  hole: number;
  quality: string;
  yards: number | null;
  previous: { hole: number; quality: string; yards: number | null; atMs: number } | null;
  nowMs: number;
}): boolean {
  const prev = args.previous;
  if (!prev) return true;
  // Quality alone does not reload. good/soft show the same yards; none is a
  // number↔dash change, which still waits out the interval unless the hole changed.
  if (prev.hole !== args.hole) return true;
  if (args.nowMs - prev.atMs < WATCH_WIDGET_RELOAD_MIN_MS) return false;
  if (prev.yards == null || args.yards == null) return prev.yards !== args.yards;
  return Math.abs(args.yards - prev.yards) >= WATCH_WIDGET_RELOAD_MIN_YD;
}
