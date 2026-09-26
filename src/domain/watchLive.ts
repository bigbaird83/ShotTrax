import { SOFT_GPS_MAX_M } from '../config/sensing';
import { haversineYards } from './haversine';
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
 * least 1 yard and must wait out 45 seconds. While the Watch app is on screen
 * the face is hidden, so only a hole change reloads; leaving the app re-checks
 * with the normal rule. The in-app number is a separate freeze: it holds still
 * while the wrist is down and refreshes when the app is showing again.
 */
export const WATCH_WIDGET_RELOAD_MIN_YD = 1;
export const WATCH_WIDGET_RELOAD_MIN_MS = 45_000;

/**
 * After a shot is marked on the Watch, the live yards hold still: nothing
 * updates for 30 seconds, and after that only once the Watch has moved at
 * least 10 yards from where the shot was marked. A hole change ends the hold.
 * The complication follows the held number.
 * `WatchClubSession.shotHoldDecision` mirrors `watchShotHoldDecision`.
 */
export const WATCH_SHOT_HOLD_MS = 30_000;
export const WATCH_SHOT_HOLD_MIN_MOVE_YD = 10;

export type WatchShotHold = { hole: number; atMs: number; anchor: LatLng | null };

/**
 * `update`: no hold (or a different hole) — adopt the fix.
 * `hold`: keep the number on screen.
 * `anchor`: the mark had no fresh fix; this fix becomes the spot to measure
 * 10 yards from, and the number stays held.
 * `release`: moved far enough — clear the hold and adopt the fix.
 */
export function watchShotHoldDecision(args: {
  hold: WatchShotHold | null;
  hole: number;
  nowMs: number;
  fix: LatLng;
  accuracyM: number;
}): 'update' | 'hold' | 'anchor' | 'release' {
  const hold = args.hold;
  if (!hold || hold.hole !== args.hole) return 'update';
  if (args.nowMs - hold.atMs < WATCH_SHOT_HOLD_MS) return 'hold';
  // GPS scatter on a weak fix is not a walk, and it is no place to measure from.
  const usable = Number.isFinite(args.accuracyM) && args.accuracyM > 0 && args.accuracyM <= SOFT_GPS_MAX_M;
  if (!usable) return 'hold';
  if (!hold.anchor) return 'anchor';
  return haversineYards(hold.anchor, args.fix) >= WATCH_SHOT_HOLD_MIN_MOVE_YD ? 'release' : 'hold';
}

export type WatchAppLiveYards = { yards: number | null; quality: string };

/**
 * The Watch app is showing the live number only while the scene is active and
 * the always-on view is not dimmed. Inactive, background, and
 * `isLuminanceReduced` are wrist-down: keep the last drawn number.
 */
export function watchAppShowsLiveYards(sceneActive: boolean, luminanceReduced: boolean): boolean {
  return sceneActive && !luminanceReduced;
}

/**
 * Number drawn in the Watch app. GPS and the complication keep the latest
 * yards either way. While the wrist is down, keep `shown`. On raise, show
 * `current` immediately, unless a shot hold is still on — then `shown` (the
 * mark) stays until that hold ends.
 * `WatchClubSession.appLiveYardsDisplay` mirrors this.
 */
export function watchAppLiveYardsDisplay(args: {
  sceneActive: boolean;
  luminanceReduced: boolean;
  holdActive: boolean;
  shown: WatchAppLiveYards;
  current: WatchAppLiveYards;
}): WatchAppLiveYards {
  if (!watchAppShowsLiveYards(args.sceneActive, args.luminanceReduced) || args.holdActive) {
    return args.shown;
  }
  return args.current;
}

/** A putter mark opens the putt sheet and does not start the 30 s / 10 yd hold. */
export function watchShotMarkStartsHold(clubId: string): boolean {
  return !isPutterClubId(clubId);
}

/**
 * A penalty is one score stroke, not a club mark. It must not start the
 * 30 s / 10 yd hold, and it must not touch the wrist-down freeze or the
 * complication. `WatchClubSession.pickPenalty` does not call `beginShotHold`.
 */
export function watchPenaltyStartsShotHold(): false {
  return false;
}

/** Club marks use `watchShotMarkStartsHold`. A penalty never starts the hold. */
export function watchMarkStartsShotHold(
  mark: { kind: 'club'; clubId: string } | { kind: 'penalty' },
): boolean {
  if (mark.kind === 'penalty') return watchPenaltyStartsShotHold();
  return watchShotMarkStartsHold(mark.clubId);
}

/** Background GPS during the golf workout. Must ship with allowsBackgroundLocationUpdates. */
export function watchLiveLocationBackgroundMode(): 'location' {
  return 'location';
}

/** Wrist-down walking filter. Wrist-up stays unfiltered so a club mark stays under 3 s. */
export const WATCH_LIVE_DISTANCE_FILTER_M = 3;

export const WATCH_LOCATION_WHEN_IN_USE =
  'ShotTraxx™ uses Watch location during a round to show yards to the green and mark where you hit from.';

/** Caption under the dash in the Watch app. The complication stays "—" with no caption. */
export const WATCH_LIVE_YARDS_NO_GREEN = 'No green';
export const WATCH_LIVE_YARDS_WEAK_GPS = 'Weak GPS';
export const WATCH_LIVE_YARDS_LOCATION_OFF = 'Location off';
export const WATCH_LIVE_YARDS_FINDING_GPS = 'Finding GPS';

export type WatchLiveYardsAuth = 'notDetermined' | 'restricted' | 'denied' | 'authorized';

/**
 * The location sheet is shown only while the Watch app is in use.
 * A background launch (complication transfer, application context, workout)
 * must not call `requestWhenInUseAuthorization` — watchOS delays that prompt
 * and leaves status notDetermined. Ask on the active scene, and ask again
 * the next time the scene becomes active if it is still notDetermined.
 * An in-flight request is not repeated until the scene leaves active, so a
 * synchronous notDetermined callback cannot loop.
 * `WatchClubSession.requestLiveLocationAuthorizationIfNeeded` mirrors this.
 */
export function watchShouldRequestLocationAuthorization(args: {
  sceneActive: boolean;
  authorization: WatchLiveYardsAuth;
  requestInFlight: boolean;
}): boolean {
  return args.sceneActive && args.authorization === 'notDetermined' && !args.requestInFlight;
}

/**
 * Why the Watch app is showing a dash. Null when a trusted yardage is showing,
 * or when none of the four honest states apply (still notDetermined, or a fix
 * that was rejected for a reason other than accuracy). Never a yardage.
 */
export function watchLiveYardsReason(args: {
  hasTrustedYards: boolean;
  hasGreen: boolean;
  authorization: WatchLiveYardsAuth;
  accuracyM: number | null;
}): string | null {
  if (args.hasTrustedYards) return null;
  if (!args.hasGreen) return WATCH_LIVE_YARDS_NO_GREEN;
  if (args.authorization === 'denied' || args.authorization === 'restricted') {
    return WATCH_LIVE_YARDS_LOCATION_OFF;
  }
  const accuracy = args.accuracyM;
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > SOFT_GPS_MAX_M) {
    return WATCH_LIVE_YARDS_WEAK_GPS;
  }
  const usableFix =
    accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= SOFT_GPS_MAX_M;
  if (!usableFix && args.authorization === 'authorized') return WATCH_LIVE_YARDS_FINDING_GPS;
  return null;
}

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
  /** Watch app frontmost: the face cannot be seen, so a reload is wasted. */
  appOnScreen?: boolean;
}): boolean {
  const prev = args.previous;
  if (!prev) return true;
  // Quality alone does not reload. good/soft show the same yards; none is a
  // number↔dash change, which still waits out the interval unless the hole changed.
  if (prev.hole !== args.hole) return true;
  if (args.appOnScreen) return false;
  if (args.nowMs - prev.atMs < WATCH_WIDGET_RELOAD_MIN_MS) return false;
  if (prev.yards == null || args.yards == null) return prev.yards !== args.yards;
  return Math.abs(args.yards - prev.yards) >= WATCH_WIDGET_RELOAD_MIN_YD;
}
