/**
 * Round start and hole change stay on the play/hole view.
 * All clubs is a separate control — never the dest of start / Prev / Next.
 */

export function playHoleHref(
  roundId: string,
  holeNumber: number,
): `/round/${string}/hole/${number}` {
  return `/round/${roundId}/hole/${holeNumber}`;
}

/** Fresh round always opens hole 1 play — not All clubs. */
export function playHrefAfterRoundStart(roundId: string): `/round/${string}/hole/1` {
  return `/round/${roundId}/hole/1`;
}

/** Prev hole / Next hole stay on play. Never club-pick. */
export function playHrefAfterHoleChange(
  roundId: string,
  holeNumber: number,
): `/round/${string}/hole/${number}` {
  return playHoleHref(roundId, holeNumber);
}

export function allClubsHref(roundId: string, holeNumber: number): string {
  return `/round/${roundId}/club-pick?hole=${holeNumber}`;
}

export function playHrefIsAllClubs(href: string): boolean {
  return href.includes('club-pick');
}

/** All clubs opens only from the All clubs control. */
export function allClubsOnlyViaControl(): true {
  return true;
}
