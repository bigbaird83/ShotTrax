export type FixQuality = 'good' | 'soft' | 'forced';

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
  startFixQuality: FixQuality | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracyM: number | null;
  endFixQuality: FixQuality | null;
  distanceYards: number | null;
  fixQuality: FixQuality | null;
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
