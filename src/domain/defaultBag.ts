import type { Club } from './types';

export const PUTTER_CLUB_ID = 'club_putter';

export const STOCK_LONG_IRONS = ['club_2i', 'club_3i', 'club_4i'] as const;

/** Distinct lofted wedges. PW stays separate. 48° / 50° sit between PW and GW. */
export const STOCK_WEDGES = ['club_48', 'club_50', 'club_gw', 'club_sw', 'club_lw'] as const;

export type StockClub = Omit<Club, 'enabled'>;

/** Typical carry is yards, not GPS. Cap matches the longest mark we would keep. */
export const MAX_TYPICAL_CARRY_YARDS = 400;

/** Build 19 invented these seeds. Upgrade clears a value only when it still matches. */
export const LEGACY_STOCK_CARRY_YARDS: Readonly<Record<string, number>> = {
  club_driver: 230,
  club_3w: 210,
  club_5w: 195,
  club_4h: 185,
  club_2i: 200,
  club_3i: 190,
  club_4i: 180,
  club_5i: 170,
  club_6i: 160,
  club_7i: 150,
  club_8i: 140,
  club_9i: 130,
  club_pw: 120,
  club_gw: 105,
  club_sw: 90,
  club_lw: 75,
};

/** Stock bag. No fake carry — empty until the player types a number (or fill estimates). */
export const DEFAULT_BAG: StockClub[] = [
  { id: 'club_driver', name: 'Driver', shortName: 'Dr', loftRank: 0, sortOrder: 0, typicalCarryYards: null },
  { id: 'club_3w', name: '3 Wood', shortName: '3W', loftRank: 1, sortOrder: 1, typicalCarryYards: null },
  { id: 'club_5w', name: '5 Wood', shortName: '5W', loftRank: 2, sortOrder: 2, typicalCarryYards: null },
  { id: 'club_4h', name: '4 Hybrid', shortName: '4H', loftRank: 3, sortOrder: 3, typicalCarryYards: null },
  { id: 'club_2i', name: '2 Iron', shortName: '2i', loftRank: 4, sortOrder: 4, typicalCarryYards: null },
  { id: 'club_3i', name: '3 Iron', shortName: '3i', loftRank: 5, sortOrder: 5, typicalCarryYards: null },
  { id: 'club_4i', name: '4 Iron', shortName: '4i', loftRank: 6, sortOrder: 6, typicalCarryYards: null },
  { id: 'club_5i', name: '5 Iron', shortName: '5i', loftRank: 7, sortOrder: 7, typicalCarryYards: null },
  { id: 'club_6i', name: '6 Iron', shortName: '6i', loftRank: 8, sortOrder: 8, typicalCarryYards: null },
  { id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9, sortOrder: 9, typicalCarryYards: null },
  { id: 'club_8i', name: '8 Iron', shortName: '8i', loftRank: 10, sortOrder: 10, typicalCarryYards: null },
  { id: 'club_9i', name: '9 Iron', shortName: '9i', loftRank: 11, sortOrder: 11, typicalCarryYards: null },
  { id: 'club_pw', name: 'Pitching Wedge', shortName: 'PW', loftRank: 12, sortOrder: 12, typicalCarryYards: null },
  { id: 'club_48', name: '48°', shortName: '48°', loftRank: 13, sortOrder: 13, typicalCarryYards: null },
  { id: 'club_50', name: '50°', shortName: '50°', loftRank: 14, sortOrder: 14, typicalCarryYards: null },
  { id: 'club_gw', name: 'Gap Wedge', shortName: 'GW', loftRank: 15, sortOrder: 15, typicalCarryYards: null },
  { id: 'club_sw', name: '56°', shortName: '56°', loftRank: 16, sortOrder: 16, typicalCarryYards: null },
  { id: 'club_lw', name: '60°', shortName: '60°', loftRank: 17, sortOrder: 17, typicalCarryYards: null },
  { id: 'club_putter', name: 'Putter', shortName: 'Pt', loftRank: 18, sortOrder: 18, typicalCarryYards: null },
];

export function isPutterClubId(clubId: string | null | undefined): boolean {
  return clubId === PUTTER_CLUB_ID;
}

/** Stock typical-carry default. Always empty — no fake average. */
export function typicalCarryForClub(_clubId: string | null | undefined): number | null {
  return null;
}

/** Parse bag-edit yards. Empty or invalid → null (clear). Never invented from GPS. */
export function parseTypicalCarryYards(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const yards = Math.round(n);
  if (yards < 1 || yards > MAX_TYPICAL_CARRY_YARDS) return null;
  return yards;
}

/** Seed that drives top-3 until ≥5 live GPS samples. Putter is always null. */
export function typicalCarrySeedForClub(club: {
  id: string;
  typicalCarryYards?: number | null;
}): number | null {
  if (isPutterClubId(club.id)) return null;
  return parseTypicalCarryYards(
    club.typicalCarryYards == null ? '' : String(club.typicalCarryYards),
  );
}

/** Putter stays in the bag for scoring / green play, never a distance sample. */
export function clubCountsTowardDistanceSamples(clubId: string | null | undefined): boolean {
  return clubId != null && !isPutterClubId(clubId);
}

/** True when a stored value is still the Build 19 invented seed. */
export function isLegacyStockCarry(clubId: string, yards: number | null | undefined): boolean {
  if (yards == null) return false;
  return LEGACY_STOCK_CARRY_YARDS[clubId] === yards;
}
