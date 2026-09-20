import type { Club } from './types';

/**
 * Last marked club stays selected on the wheel. Re-tap that club to mark again.
 * Same club is gone — the dock slot is Hole Out. Re-tap the club to mark again.
 * No logged shot → no leftover driver or wedge invented.
 */
export function sameClubVisibleWithoutShot(): false {
  return false;
}

export function sameClubNeedsLoggedShot(): true {
  return true;
}

export function resolveStickyClub(args: {
  enabledClubs: Club[];
  roundLastClubId?: string | null;
  lastShotClubId?: string | null;
  previousRoundLastClubId?: string | null;
}): Club | null {
  const enabled = args.enabledClubs.filter((club) => club.enabled);
  if (enabled.length === 0) return null;
  const ids = new Set(enabled.map((club) => club.id));
  const pick =
    (args.roundLastClubId && ids.has(args.roundLastClubId) ? args.roundLastClubId : null) ??
    (args.lastShotClubId && ids.has(args.lastShotClubId) ? args.lastShotClubId : null) ??
    (args.previousRoundLastClubId && ids.has(args.previousRoundLastClubId)
      ? args.previousRoundLastClubId
      : null);
  if (!pick) return null;
  return enabled.find((club) => club.id === pick) ?? null;
}

/** Resolve a tapped or spoken club against the enabled bag. */
export function selectClubForMark(club: Club | null, enabledClubs: Club[]): Club | null {
  if (!club || !club.enabled) return null;
  return enabledClubs.some((row) => row.id === club.id && row.enabled) ? club : null;
}
