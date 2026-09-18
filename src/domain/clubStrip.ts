import { isPutterClubId } from './defaultBag';

/** Phone and Watch share this strip. Sorted by carry, not name. */
export function clubStripSortedByCarry(): true {
  return true;
}

export function clubStripSortedByName(): false {
  return false;
}

/** Swiping continues through the rest of the bag. Not capped at three. */
export function clubStripCappedAtThree(): false {
  return false;
}

export function clubStripShorterPeeksLeft(): true {
  return true;
}

export function clubStripLongerPeeksRight(): true {
  return true;
}

export function clubStripSwipeMarksShot(): false {
  return false;
}

export function clubStripScrollMarksShot(): false {
  return false;
}

export function clubStripOnlyTapMarks(): true {
  return true;
}

export function clubStripPutterIncluded(): false {
  return false;
}

/** Center pill is the carry closest to yards left — not the tee club after a shot lands. */
export function clubStripCenterIsClosestCarry(): true {
  return true;
}

export function clubStripCenterIsTeeClub(): false {
  return false;
}

export function clubStripPhoneMatchesWatch(): true {
  return true;
}

/** A phone strip tap is the same mark as the old suggested chip, including the 600-yard check. */
export function clubStripTapMarksLikeChip(): true {
  return true;
}

export function clubStripTapUsesHomeClubTap(): true {
  return true;
}

/** Center is closest carry to hole yards / yards left — never bag order or the tee club. */
export function clubStripCenterUsesHoleYards(): true {
  return true;
}

/** After a shot lands, the middle pill is closest to yards left — not the tee club. */
export function clubStripCenterUsesYardsLeft(): true {
  return true;
}

export function clubStripUsesRankedTop3(): false {
  return false;
}

export function clubStripUsesFullBag(): true {
  return true;
}

export function carryFromClubLabel(label: string): number | null {
  const raw = label.split(' · ')[1]?.trim();
  if (!raw || raw === '—') return null;
  const yards = Number(raw);
  return Number.isFinite(yards) ? yards : null;
}

export type ClubStripClub = {
  id: string;
  carry: number | null;
};

export type ClubStripPlan = {
  ids: string[];
  openIndex: number;
  pickId: string | null;
};

/**
 * Full-bag strip (putter out). Short carry on the left, long on the right.
 * Opens on the club whose carry is closest to yards left.
 */
export function planClubStrip(args: {
  clubs: ClubStripClub[];
  yardsLeft?: number | null;
}): ClubStripPlan {
  const ordered = args.clubs
    .filter((club) => !isPutterClubId(club.id))
    .map((club) => ({
      id: club.id,
      carry: club.carry != null && Number.isFinite(club.carry) ? club.carry : null,
    }))
    .sort((a, b) => {
      const ac = a.carry ?? Number.POSITIVE_INFINITY;
      const bc = b.carry ?? Number.POSITIVE_INFINITY;
      if (ac !== bc) return ac - bc;
      return 0;
    });

  const yards = args.yardsLeft;
  let pick: string | null = null;
  if (yards != null && Number.isFinite(yards)) {
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const club of ordered) {
      if (club.carry == null) continue;
      const delta = Math.abs(club.carry - yards);
      if (delta < bestDelta) {
        bestDelta = delta;
        pick = club.id;
      }
    }
  }
  if (!pick) pick = ordered[0]?.id ?? null;
  const openIndex = pick ? Math.max(0, ordered.findIndex((club) => club.id === pick)) : 0;
  return { ids: ordered.map((club) => club.id), openIndex, pickId: pick };
}
