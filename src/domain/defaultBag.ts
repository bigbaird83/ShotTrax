import type { Club } from './types';

export const PUTTER_CLUB_ID = 'club_putter';

export const STOCK_LONG_IRONS = ['club_2i', 'club_3i', 'club_4i'] as const;

/** Distinct lofted wedges. Keep PW separate — do not collapse these into one SW. */
export const STOCK_WEDGES = ['club_gw', 'club_sw', 'club_lw'] as const;

export type StockClub = Omit<Club, 'enabled'>;

/** Typical carry is yards, not GPS. Cap matches the longest mark we would keep. */
export const MAX_TYPICAL_CARRY_YARDS = 400;

/** Stock bag. Voice nicknames live in `voiceClub.ts`; loftRank ranks shorter clubs higher. */
export const DEFAULT_BAG: StockClub[] = [
  { id: 'club_driver', name: 'Driver', shortName: 'Dr', loftRank: 0, sortOrder: 0, typicalCarryYards: 230 },
  { id: 'club_3w', name: '3 Wood', shortName: '3W', loftRank: 1, sortOrder: 1, typicalCarryYards: 210 },
  { id: 'club_5w', name: '5 Wood', shortName: '5W', loftRank: 2, sortOrder: 2, typicalCarryYards: 195 },
  { id: 'club_4h', name: '4 Hybrid', shortName: '4H', loftRank: 3, sortOrder: 3, typicalCarryYards: 185 },
  { id: 'club_2i', name: '2 Iron', shortName: '2i', loftRank: 4, sortOrder: 4, typicalCarryYards: 200 },
  { id: 'club_3i', name: '3 Iron', shortName: '3i', loftRank: 5, sortOrder: 5, typicalCarryYards: 190 },
  { id: 'club_4i', name: '4 Iron', shortName: '4i', loftRank: 6, sortOrder: 6, typicalCarryYards: 180 },
  { id: 'club_5i', name: '5 Iron', shortName: '5i', loftRank: 7, sortOrder: 7, typicalCarryYards: 170 },
  { id: 'club_6i', name: '6 Iron', shortName: '6i', loftRank: 8, sortOrder: 8, typicalCarryYards: 160 },
  { id: 'club_7i', name: '7 Iron', shortName: '7i', loftRank: 9, sortOrder: 9, typicalCarryYards: 150 },
  { id: 'club_8i', name: '8 Iron', shortName: '8i', loftRank: 10, sortOrder: 10, typicalCarryYards: 140 },
  { id: 'club_9i', name: '9 Iron', shortName: '9i', loftRank: 11, sortOrder: 11, typicalCarryYards: 130 },
  { id: 'club_pw', name: 'Pitching Wedge', shortName: 'PW', loftRank: 12, sortOrder: 12, typicalCarryYards: 120 },
  { id: 'club_gw', name: '52°', shortName: '52°', loftRank: 13, sortOrder: 13, typicalCarryYards: 105 },
  { id: 'club_sw', name: '56°', shortName: '56°', loftRank: 14, sortOrder: 14, typicalCarryYards: 90 },
  { id: 'club_lw', name: '60°', shortName: '60°', loftRank: 15, sortOrder: 15, typicalCarryYards: 75 },
  { id: 'club_putter', name: 'Putter', shortName: 'Pt', loftRank: 16, sortOrder: 16, typicalCarryYards: null },
];

const TYPICAL_CARRY_BY_ID = new Map(
  DEFAULT_BAG.map((club) => [club.id, club.typicalCarryYards] as const),
);

export function isPutterClubId(clubId: string | null | undefined): boolean {
  return clubId === PUTTER_CLUB_ID;
}

/** Stock typical-carry default. Putter and custom clubs have none. */
export function typicalCarryForClub(clubId: string | null | undefined): number | null {
  if (!clubId) return null;
  return TYPICAL_CARRY_BY_ID.get(clubId) ?? null;
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
