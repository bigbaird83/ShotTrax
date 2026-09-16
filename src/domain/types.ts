export type FixQuality = 'good' | 'soft' | 'forced';

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
  startLat: number;
  startLng: number;
  startAccuracyM: number | null;
  startFixQuality: FixQuality;
  endLat: number | null;
  endLng: number | null;
  endAccuracyM: number | null;
  endFixQuality: FixQuality | null;
  distanceYards: number | null;
  fixQuality: FixQuality;
  impossibleJump: boolean;
  startedAt: string;
  endedAt: string | null;
};

export type OpenShot = {
  id: string;
  startLat: number;
  startLng: number;
  startFixQuality: FixQuality;
};
