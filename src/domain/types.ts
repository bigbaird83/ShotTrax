export type FixQuality = 'good' | 'soft' | 'forced';

/** Missed-mark / no GPS. Not a GPS quality; never a distance or top-3 sample. */
export type ShotFixQuality = FixQuality | 'none';

/** How the shot was logged. `no_gps` never stores coordinates. */
export type ShotSource = 'gps' | 'no_gps';

export type PenaltyReason = 'water' | 'ob' | 'unplayable' | 'other';

export type GpsFix = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  mocked: boolean;
  isSimulator: boolean;
  timestamp: number;
};

export type Club = {
  id: string;
  name: string;
  shortName: string;
  loftRank: number;
  sortOrder: number;
  enabled: boolean;
};

export type Round = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  courseName: string | null;
  holeCount: number;
};

export type Hole = {
  id: string;
  roundId: string;
  number: number;
  par: number;
  score: number | null;
  /** User GPS or map-dropped green estimate — not a licensed pin. */
  greenLat: number | null;
  greenLng: number | null;
};

export type Shot = {
  id: string;
  holeId: string;
  clubId: string | null;
  seq: number;
  /** Null on `no_gps` shots — ShotTrax does not invent coordinates. */
  startLat: number | null;
  startLng: number | null;
  startAccuracyM: number | null;
  startFixQuality: ShotFixQuality | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracyM: number | null;
  endFixQuality: ShotFixQuality | null;
  /** GPS haversine yards only. Always null on `no_gps` / `fixQuality: none`. */
  distanceYards: number | null;
  /** Optional typed yards for UI/score notes. Never a club-average sample. */
  typedYards: number | null;
  fixQuality: ShotFixQuality | null;
  impossibleJump: boolean;
  startedAt: string;
  endedAt: string | null;
  source: ShotSource;
};

export type HolePenalty = {
  id: string;
  holeId: string;
  strokes: number;
  reason: PenaltyReason;
  note: string | null;
  createdAt: string;
};

export type OpenShot = {
  id: string;
  startLat: number;
  startLng: number;
  startFixQuality: FixQuality;
};
