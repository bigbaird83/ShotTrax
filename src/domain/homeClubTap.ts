import { haversineYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

/** Phone farther than this from the tee is home-scale — not a lie on the hole. */
export const HOME_CLUB_TAP_MAX_YD = 600;

export function homeClubTapMaxYards(): typeof HOME_CLUB_TAP_MAX_YD {
  return HOME_CLUB_TAP_MAX_YD;
}

/** Home-scale club tap / Same club never runs acceptFix. On-course taps still do. */
export function homeClubTapRunsAcceptFix(): false {
  return false;
}

/** Never write the house GPS as the ball. */
export function homeClubTapUsesHouseStart(): false {
  return false;
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
  | { kind: 'tee'; start: LatLng; source: 'placed'; runsAcceptFix: false };

/**
 * Suggested club / Same club start.
 * Phone > 600 yd from the tee → start at the tee, badge Placed, skip acceptFix.
 * On the course (≤ 600 yd) → phone, GPS, acceptFix as today.
 * No tee → cannot detect home; keep the phone (do not invent a tee).
 * No phone → null (caller still needs a fix).
 */
export function planClubTapStart(args: {
  phone: LatLng | null | undefined;
  tee: LatLng | null | undefined;
}): ClubTapStart | null {
  if (!isValidLatLng(args.phone)) return null;
  if (phoneIsHomeFromTee(args.phone, args.tee) && isValidLatLng(args.tee)) {
    return { kind: 'tee', start: args.tee, source: 'placed', runsAcceptFix: false };
  }
  return { kind: 'phone', start: args.phone, source: 'gps', runsAcceptFix: true };
}
