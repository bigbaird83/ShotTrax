export type FixQuality = 'good' | 'soft' | 'forced';

/** Missed-mark / no GPS. Not a GPS quality; never a distance or top-3 sample. */
export type ShotFixQuality = FixQuality | 'none';

/** How the shot was logged. `no_gps` never stores coordinates. `placed` is two player map taps. */
export type ShotSource = 'gps' | 'no_gps' | 'placed';

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
  /** User-set or stock typical carry in yards. Null on putter, when cleared, or custom-until-set. */
  typicalCarryYards: number | null;
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
  /** Course tee coordinate from the API or OSM. Never the phone / house. */
  teeLat: number | null;
  teeLng: number | null;
  /** 0–5. Stats / scoring only — never a map mark or club-distance sample. */
  putts: number;
  /** One length bucket per putt, same order. Stats only — no green GPS. */
  puttLengths: string[];
  /** True only after Made it or Finish hole. Walking off the green never sets this. */
  puttsDone: boolean;
  /** Stored after Finish hole. Null until set. Never invented from a missing green. */
  gir: boolean | null;
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
  /** Haversine yards from GPS marks or two placed map points. Always null on `no_gps`. */
  distanceYards: number | null;
  /** Optional typed yards for UI/score notes. Never a club-average sample. */
  typedYards: number | null;
  /** GPS quality. Null on catch-up `placed` shots — they have no soft/good quality. */
  fixQuality: ShotFixQuality | null;
  impossibleJump: boolean;
  startedAt: string;
  endedAt: string | null;
  source: ShotSource;
  /** Walk-away auto-mark with the #1 suggested club. */
  suggested: boolean;
  /**
   * ISO time after which this shot may enter club averages / the seed-five.
   * Null on live GPS and older rows — already eligible. Set on Confirm so the
   * 5s Undo window never moves the average.
   */
  averageEligibleAt?: string | null;
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
  /** Null on a home-scale Placed tee start — no GPS quality. */
  startFixQuality: FixQuality | null;
};
