import type { Club } from './types';

/**
 * Last marked club stays selected so Same club is one tap.
 * Say/tap a club marks GPS immediately (club=mark). Same club is the escape.
 */
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
  if (pick) return enabled.find((club) => club.id === pick) ?? enabled[0];
  return [...enabled].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

/** Resolve a tapped or spoken club against the enabled bag. */
export function selectClubForMark(club: Club | null, enabledClubs: Club[]): Club | null {
  if (!club || !club.enabled) return null;
  return enabledClubs.some((row) => row.id === club.id && row.enabled) ? club : null;
}
