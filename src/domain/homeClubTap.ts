import { haversineYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

/** Phone farther than this from the tee is home-scale — not a lie on the hole. */
export const HOME_CLUB_TAP_MAX_YD = 600;

export function homeClubTapMaxYards(): typeof HOME_CLUB_TAP_MAX_YD {
  return HOME_CLUB_TAP_MAX_YD;
}

/** Home-scale club tap never runs acceptFix. On-course taps still do. */
export function homeClubTapRunsAcceptFix(): false {
  return false;
}

/** A Placed tee start is not a GPS fix — no 15 m / 25 m accuracy gates. */
export function placedStartRunsAccuracyGates(): false {
  return false;
}

/** 600 from the tee, not the 400-yard shot-save confirm. */
export function homeClubTapUsesShotSaveGate(): false {
  return false;
}

/** Never write the house GPS as the ball. */
export function homeClubTapUsesHouseStart(): false {
  return false;
}

/** Same club, All clubs, Say a club, and Watch bag still use this 600-yard rule. The play wheel only selects. */
export function homeClubTapPaths(): readonly ['same_club', 'all_clubs', 'say_club', 'watch_bag'] {
  return ['same_club', 'all_clubs', 'say_club', 'watch_bag'];
}

/** Prefer Watch vs phone first. The 600-yard check is on that chosen fix. */
export function clubTapMeasuresChosenFix(): true {
  return true;
}

/** On-course (≤ 600) still runs acceptFix 15 m good / 25 m soft. */
export function clubTapSkipsOnCourseAccuracyGates(): false {
  return false;
}

/**
 * Measure the fix we were about to save — after Watch-vs-phone preference.
 * Do not invent a coordinate. Do not skip on-course accuracy gates.
 */
export function planClubTapAfterChosenFix(args: {
  chosenFix: LatLng | null | undefined;
  tee: LatLng | null | undefined;
  holePin?: LatLng | null;
}): ClubTapStart | null {
  return planClubTapStart({
    phone: args.chosenFix,
    tee: args.tee,
    holePin: args.holePin,
  });
}

export function phoneIsHomeFromTee(
  phone: LatLng | null | undefined,
  tee: LatLng | null | undefined,
): boolean {
  if (!isValidLatLng(phone) || !isValidLatLng(tee)) return false;
  return haversineYards(phone, tee) > HOME_CLUB_TAP_MAX_YD;
}

export type ClubTapStart =
  | { kind: 'phone'; start: LatLng; source: 'gps'; runsAcceptFix: true }
  | { kind: 'tee'; start: LatLng; source: 'placed'; runsAcceptFix: false }
  | { kind: 'blocked' };

/**
 * Suggested club / Same club start.
 * Phone > 600 yd from the tee → start at the tee, badge Placed, skip acceptFix.
 * On the course (≤ 600 yd) → phone, GPS, acceptFix as today.
 * Home-scale but no tee → blocked. Do not invent a tee and do not save the house.
 * `holePin` (green / course) is only used to detect home when tee is missing.
 * No phone → null (caller still needs a fix).
 */
export function planClubTapStart(args: {
  phone: LatLng | null | undefined;
  tee: LatLng | null | undefined;
  holePin?: LatLng | null;
}): ClubTapStart | null {
  if (!isValidLatLng(args.phone)) return null;
  if (isValidLatLng(args.tee)) {
    if (phoneIsHomeFromTee(args.phone, args.tee)) {
      return { kind: 'tee', start: args.tee, source: 'placed', runsAcceptFix: false };
    }
    return { kind: 'phone', start: args.phone, source: 'gps', runsAcceptFix: true };
  }
  if (phoneIsHomeFromTee(args.phone, args.holePin)) {
    return { kind: 'blocked' };
  }
  return { kind: 'phone', start: args.phone, source: 'gps', runsAcceptFix: true };
}
