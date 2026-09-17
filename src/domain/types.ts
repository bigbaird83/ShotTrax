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

export type ParSource = 'course' | 'user';

export type Round = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  courseName: string | null;
  holeCount: number;
  /** Golf Courses API id when a course was picked. Null if unnamed / typed. */
  courseApiId: string | null;
  /** Course pin from the API — used for OSM overlay, never invented. */
  courseLat: number | null;
  courseLng: number | null;
  /** Selected named tee. Blank fields stay blank. */
  teeName: string | null;
  teeRating: number | null;
  teeSlope: number | null;
  teeTotalYards: number | null;
  /** Last club used on a mark. Sticky for Same club. */
  lastClubId: string | null;
};

export type GreenSource = 'user_estimate' | 'course_centroid';

export type Hole = {
  id: string;
  roundId: string;
  number: number;
  /** Null when course par is missing — never invented. Shown as "Par unknown". */
  par: number | null;
  parSource: ParSource | null;
  score: number | null;
  /** Tee yardage from course data. Null if the API omitted it. */
  yards: number | null;
  /** Stroke index 1–18 from course data. Null → “SI unknown”. */
  handicap: number | null;
  /** User GPS/map pin or course centroid — never invented. */
  greenLat: number | null;
  greenLng: number | null;
  greenSource: GreenSource | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
  greenDepthYards: number | null;
};

export type Shot = {
  id: string;
  holeId: string;
  clubId: string | null;
  seq: number;
  /** Null on `no_gps` shots — ShotTraxx does not invent coordinates. */
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

export type PenaltyKind = 'drop' | 'penalty';

export type HolePenalty = {
  id: string;
  holeId: string;
  strokes: number;
  reason: PenaltyReason;
  note: string | null;
  createdAt: string;
  kind: PenaltyKind;
  lat: number | null;
  lng: number | null;
};

export type OpenShot = {
  id: string;
  startLat: number;
  startLng: number;
  startFixQuality: FixQuality;
};
