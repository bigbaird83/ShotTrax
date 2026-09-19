import { hole1TeeGreenFromCourse } from '../course/layout';
import type { CourseDetail } from '../course/types';
import {
  courseCardHoleSpanYards,
  courseCardSpanIsAbsurd,
  courseCardSpanIsSamePoint,
  courseCardSpanLooksLikeHole,
  diagnoseCourseCardFrame,
  holeFrameRegion,
  planCourseCardCamera,
} from './holeCamera';
import { isCourseCardLatLng, isNearZeroLatLng, type LatLng } from './latLng';
import { holeMapRegionIsPaintable } from './mapPaint';
import {
  CABOT_POCKET_LIVE_CARDS,
  CAMDEN_CC,
  CYPRESS_CREEK_CABOT,
  DOC_BLANK_COURSE_NAMES,
  DOC_CABOT_POCKET_NAMES,
  DOC_PAINT_COURSE_NAMES,
  GREYSTONE_CABOT,
  MAGNOLIA_CC,
  PLEASANT_VALLEY_LITTLE_ROCK,
} from './reproCourseCard';

export type CourseCardPaintReason =
  | 'sane_region'
  | 'missing_tee'
  | 'missing_green'
  | 'missing_both'
  | 'zero_coord'
  | 'same_point'
  | 'absurd_span'
  | 'no_camera'
  | 'bad_region';

export type CourseCardPaintDecision = {
  mount: boolean;
  reason: CourseCardPaintReason;
  tee: LatLng | null;
  green: LatLng | null;
  spanYards: number | null;
  region: ReturnType<typeof holeFrameRegion>;
};

export type CourseCardPointKind = 'real' | 'null' | 'placeholder';

export type Hole1PayloadRow = {
  course: string;
  city: string;
  hole: 1;
  tee: LatLng | null;
  green: LatLng | null;
  teeKind: CourseCardPointKind;
  greenKind: CourseCardPointKind;
  spanYards: number | null;
  mount: boolean;
  reason: CourseCardPaintReason;
};

export type CourseCardTally = {
  paint: number;
  fail: number;
  reasons: Partial<Record<CourseCardPaintReason, number>>;
  /** Only one course failed in the sample — Cypress-shaped one-off. */
  oneOff: boolean;
  /** Two or more failed — API tier looks thin, not one bad card. */
  thinTier: boolean;
};

export type CourseCardFailFlag = {
  course: string;
  city: string;
  reason: CourseCardPaintReason;
  why: string;
};

export type Hole1PayloadDump = {
  rows: Hole1PayloadRow[];
  /** Magnolia + Camden paint; a blank in the known fail set → thin API, not paint. */
  thinApiPattern: boolean;
  /** Cypress and Greystone both miss — Cabot pocket, not one card. */
  cabotPocket: boolean;
  /** Holes / cards that must show the miss card (do not mount MapView). */
  failCount: number;
  paintCount: number;
  tally: CourseCardTally;
  failList: CourseCardFailFlag[];
};

export type CabotPocketScan = {
  cypress: Hole1PayloadRow;
  greystone: Hole1PayloadRow;
  bothBlank: boolean;
  failCount: number;
  failList: CourseCardFailFlag[];
};

/**
 * Signal Lab: mount MapView only when tee + green are real and the
 * course-card region is paintable. Otherwise miss card — never a green void.
 */
export function decideCourseCardPaint(args: {
  tee: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): CourseCardPaintDecision {
  void args.phone;
  const teeRaw = args.tee;
  const greenRaw = args.green;
  if (isNearZeroLatLng(teeRaw) || isNearZeroLatLng(greenRaw)) {
    return {
      mount: false,
      reason: 'zero_coord',
      tee: isCourseCardLatLng(teeRaw) ? teeRaw : null,
      green: isCourseCardLatLng(greenRaw) ? greenRaw : null,
      spanYards: courseCardHoleSpanYards(teeRaw, greenRaw),
      region: null,
    };
  }
  const card = diagnoseCourseCardFrame({ tee: teeRaw, green: greenRaw, phone: null });
  if (!card.ok) {
    return {
      mount: false,
      reason:
        card.missing === 'both' ? 'missing_both' : card.missing === 'tee' ? 'missing_tee' : 'missing_green',
      tee: card.tee,
      green: card.green,
      spanYards: courseCardHoleSpanYards(card.tee, card.green),
      region: null,
    };
  }
  const spanYards = courseCardHoleSpanYards(card.tee, card.green);
  if (courseCardSpanIsSamePoint(spanYards)) {
    return { mount: false, reason: 'same_point', tee: card.tee, green: card.green, spanYards, region: null };
  }
  if (courseCardSpanIsAbsurd(spanYards)) {
    return { mount: false, reason: 'absurd_span', tee: card.tee, green: card.green, spanYards, region: null };
  }
  const camera = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
  if (!camera) {
    return { mount: false, reason: 'no_camera', tee: card.tee, green: card.green, spanYards, region: null };
  }
  const region = holeFrameRegion(camera.points);
  if (!holeMapRegionIsPaintable(region) || !courseCardSpanLooksLikeHole(spanYards)) {
    return { mount: false, reason: 'bad_region', tee: card.tee, green: card.green, spanYards, region: null };
  }
  return { mount: true, reason: 'sane_region', tee: card.tee, green: card.green, spanYards, region };
}

/** MapView mounts only for a sane course-card region. Miss never mounts. */
export function courseCardShouldMountMapView(decision: CourseCardPaintDecision): boolean {
  return decision.mount && decision.reason === 'sane_region';
}

export function courseCardMissShowsMapView(): false {
  return false;
}

export function courseCardZeroCoordMountsMapView(): false {
  return false;
}

export function courseCardNullCameraMountsMapView(): false {
  return false;
}

export function courseCardSamePointMountsMapView(): false {
  return false;
}

export function courseCardAbsurdSpanMountsMapView(): false {
  return false;
}

/** Paint bug only when the region looks like a normal hole. */
export function courseCardPaintOnlyWhenNormalHole(): true {
  return true;
}

/** Never invent a green from the clubhouse / course pin ± yards. */
export function inventGreenFromCourseCenter(): false {
  return false;
}

export function inventGreenFromCenterPlusYards(): false {
  return false;
}

/** Hole start / Add shot must not wait on a map that will never paint. */
export function showPlayDockForCourseCard(args: {
  paintMounts: boolean;
  mapFramed: boolean;
  catchUpFullScreen?: boolean;
}): boolean {
  if (args.catchUpFullScreen) return true;
  if (!args.paintMounts) return true;
  return args.mapFramed;
}

export function classifyCourseCardPoint(point: LatLng | null | undefined): CourseCardPointKind {
  if (point == null) return 'null';
  if (isNearZeroLatLng(point) || !isCourseCardLatLng(point)) return 'placeholder';
  return 'real';
}

export function hole1PayloadRow(args: {
  course: string;
  city: string;
  tee: LatLng | null;
  green: LatLng | null;
}): Hole1PayloadRow {
  const paint = decideCourseCardPaint({ tee: args.tee, green: args.green, phone: null });
  return {
    course: args.course,
    city: args.city,
    hole: 1,
    tee: args.tee,
    green: args.green,
    teeKind: classifyCourseCardPoint(args.tee),
    greenKind: classifyCourseCardPoint(args.green),
    spanYards: paint.spanYards,
    mount: paint.mount,
    reason: paint.reason,
  };
}

export function tallyCourseCardPaint(
  holes: Array<{
    tee?: LatLng | null;
    green?: LatLng | null;
    mount?: boolean;
    reason?: CourseCardPaintReason;
  }>,
): CourseCardTally {
  const reasons: Partial<Record<CourseCardPaintReason, number>> = {};
  let paint = 0;
  let fail = 0;
  for (const hole of holes) {
    const decision =
      hole.reason != null
        ? { mount: hole.mount ?? hole.reason === 'sane_region', reason: hole.reason }
        : decideCourseCardPaint({
            tee: hole.tee ?? null,
            green: hole.green ?? null,
            phone: null,
          });
    if (decision.mount) {
      paint += 1;
      continue;
    }
    fail += 1;
    reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
  }
  return {
    paint,
    fail,
    reasons,
    oneOff: fail === 1 && paint >= 2,
    thinTier: fail >= 2,
  };
}

export function courseCardFailCount(
  holes: Array<{ tee?: LatLng | null; green?: LatLng | null }>,
): number {
  return holes.filter((hole) => !decideCourseCardPaint({
    tee: hole.tee ?? null,
    green: hole.green ?? null,
    phone: null,
  }).mount).length;
}

export function courseCardFailWhy(reason: CourseCardPaintReason): string | null {
  switch (reason) {
    case 'sane_region':
      return null;
    case 'missing_both':
      return 'null tee+green';
    case 'missing_tee':
      return 'null tee';
    case 'missing_green':
      return 'null green';
    case 'zero_coord':
      return '~0,0 placeholder';
    case 'same_point':
      return 'tee and green are the same point';
    case 'absurd_span':
      return 'tee–green farther than a real hole';
    case 'no_camera':
      return 'no course-card camera';
    case 'bad_region':
      return 'region is not a normal hole';
  }
}

export function flagCourseCardFails(rows: Hole1PayloadRow[]): CourseCardFailFlag[] {
  const flags: CourseCardFailFlag[] = [];
  for (const row of rows) {
    if (row.mount) continue;
    const why = courseCardFailWhy(row.reason);
    if (!why) continue;
    flags.push({ course: row.course, city: row.city, reason: row.reason, why });
  }
  return flags;
}

/** PR / Signal Lab lines: "Cypress Creek (Cabot) — null tee+green". */
export function formatCourseCardFailList(fails: CourseCardFailFlag[]): string[] {
  return fails.map((fail) => `${fail.course} (${fail.city}) — ${fail.why}`);
}

/**
 * Bulk AR / known-fail sample. Magnolia + Camden paint; Cypress, Greystone,
 * and Pleasant Valley use live card coords (null/~0,0 by default).
 */
export function dumpHole1PayloadsSideBySide(args: {
  magnolia?: { tee: LatLng | null; green: LatLng | null };
  camden?: { tee: LatLng | null; green: LatLng | null };
  cypress?: { tee: LatLng | null; green: LatLng | null };
  greystone?: { tee: LatLng | null; green: LatLng | null };
  pleasantValley?: { tee: LatLng | null; green: LatLng | null };
} = {}): Hole1PayloadDump {
  const magnolia = hole1PayloadRow({
    course: MAGNOLIA_CC.name,
    city: MAGNOLIA_CC.city,
    tee: args.magnolia?.tee ?? MAGNOLIA_CC.hole1.tee,
    green: args.magnolia?.green ?? MAGNOLIA_CC.hole1.green,
  });
  const camden = hole1PayloadRow({
    course: CAMDEN_CC.name,
    city: CAMDEN_CC.city,
    tee: args.camden?.tee ?? CAMDEN_CC.hole1.tee,
    green: args.camden?.green ?? CAMDEN_CC.hole1.green,
  });
  const cypress = hole1PayloadRow({
    course: CYPRESS_CREEK_CABOT.name,
    city: CYPRESS_CREEK_CABOT.city,
    tee: args.cypress?.tee ?? CABOT_POCKET_LIVE_CARDS[0].hole1.tee,
    green: args.cypress?.green ?? CABOT_POCKET_LIVE_CARDS[0].hole1.green,
  });
  const greystone = hole1PayloadRow({
    course: GREYSTONE_CABOT.name,
    city: GREYSTONE_CABOT.city,
    tee: args.greystone?.tee ?? CABOT_POCKET_LIVE_CARDS[1].hole1.tee,
    green: args.greystone?.green ?? CABOT_POCKET_LIVE_CARDS[1].hole1.green,
  });
  const pleasantValley = hole1PayloadRow({
    course: PLEASANT_VALLEY_LITTLE_ROCK.name,
    city: PLEASANT_VALLEY_LITTLE_ROCK.city,
    tee: args.pleasantValley?.tee ?? PLEASANT_VALLEY_LITTLE_ROCK.hole1.tee,
    green: args.pleasantValley?.green ?? PLEASANT_VALLEY_LITTLE_ROCK.hole1.green,
  });
  const rows = [magnolia, camden, cypress, greystone, pleasantValley];
  const tally = tallyCourseCardPaint(rows);
  const paintsOk = magnolia.mount && camden.mount;
  const blankMiss = [cypress, greystone, pleasantValley].some((row) => !row.mount);
  return {
    rows,
    thinApiPattern: paintsOk && blankMiss,
    cabotPocket: !cypress.mount && !greystone.mount,
    failCount: tally.fail,
    paintCount: tally.paint,
    tally,
    failList: flagCourseCardFails(rows),
  };
}

/** Cabot pocket: Cypress Creek and Greystone, checked together. */
export function scanCabotPocket(args?: {
  cypress?: { tee: LatLng | null; green: LatLng | null };
  greystone?: { tee: LatLng | null; green: LatLng | null };
}): CabotPocketScan {
  const cypress = hole1PayloadRow({
    course: CYPRESS_CREEK_CABOT.name,
    city: CYPRESS_CREEK_CABOT.city,
    tee: args?.cypress?.tee ?? CABOT_POCKET_LIVE_CARDS[0].hole1.tee,
    green: args?.cypress?.green ?? CABOT_POCKET_LIVE_CARDS[0].hole1.green,
  });
  const greystone = hole1PayloadRow({
    course: GREYSTONE_CABOT.name,
    city: GREYSTONE_CABOT.city,
    tee: args?.greystone?.tee ?? CABOT_POCKET_LIVE_CARDS[1].hole1.tee,
    green: args?.greystone?.green ?? CABOT_POCKET_LIVE_CARDS[1].hole1.green,
  });
  return {
    cypress,
    greystone,
    bothBlank: !cypress.mount && !greystone.mount,
    failCount: [cypress, greystone].filter((row) => !row.mount).length,
    failList: flagCourseCardFails([cypress, greystone]),
  };
}

export function logCabotPocket(scan: CabotPocketScan): CabotPocketScan {
  console.log('[Signal Lab] cabot-pocket', {
    paints: [...DOC_PAINT_COURSE_NAMES],
    blanks: [...DOC_CABOT_POCKET_NAMES],
    cypressCreek: scan.cypress,
    greystone: scan.greystone,
    bothBlank: scan.bothBlank,
    failCount: scan.failCount,
    failList: formatCourseCardFailList(scan.failList),
  });
  return scan;
}

/** Pull the known AR fail set in one pass — no Doc smoke list. */
export function scanKnownArCourseCards(args?: {
  cypress?: { tee: LatLng | null; green: LatLng | null };
  greystone?: { tee: LatLng | null; green: LatLng | null };
  pleasantValley?: { tee: LatLng | null; green: LatLng | null };
}): Hole1PayloadDump {
  return dumpHole1PayloadsSideBySide(args);
}

/** Flag hole-1 tee+green on pulled course details. Never invents a point. */
export function scanCourseCardDetails(
  courses: Array<{
    name: string;
    city?: string | null;
    holes: CourseDetail['holes'];
    tees?: CourseDetail['tees'];
  }>,
): { rows: Hole1PayloadRow[]; tally: CourseCardTally; failList: CourseCardFailFlag[] } {
  const rows = courses.map((course) => {
    const hole1 = hole1TeeGreenFromCourse({ holes: course.holes, tees: course.tees ?? [] });
    return hole1PayloadRow({
      course: course.name,
      city: course.city ?? '',
      tee: hole1.tee,
      green: hole1.green,
    });
  });
  return {
    rows,
    tally: tallyCourseCardPaint(rows),
    failList: flagCourseCardFails(rows),
  };
}

export function logCourseCardPaint(args: {
  courseName?: string | null;
  holeNumber: number;
  decision: CourseCardPaintDecision;
}): CourseCardPaintDecision {
  const { courseName, holeNumber, decision } = args;
  // Signal Lab device log: Cypress hole 1 tee/green vs Magnolia + Camden.
  console.log('[Signal Lab] course-card', {
    course: courseName ?? 'unknown',
    hole: holeNumber,
    tee: decision.tee,
    green: decision.green,
    teeKind: classifyCourseCardPoint(decision.tee),
    greenKind: classifyCourseCardPoint(decision.green),
    mount: decision.mount,
    reason: decision.reason,
    spanYards: decision.spanYards,
    region: decision.region,
  });
  return decision;
}

export function logHole1PayloadsSideBySide(dump: Hole1PayloadDump): Hole1PayloadDump {
  console.log('[Signal Lab] hole-1 side-by-side', {
    magnolia: dump.rows[0],
    camdenCc: dump.rows[1],
    cypressCreekCabot: dump.rows[2],
    greystoneCabot: dump.rows[3],
    pleasantValleyLittleRock: dump.rows[4],
    paints: [...DOC_PAINT_COURSE_NAMES],
    cabotPocket: [...DOC_CABOT_POCKET_NAMES],
    blanks: [...DOC_BLANK_COURSE_NAMES],
    cabotPocketBothBlank: dump.cabotPocket,
    thinApiPattern: dump.thinApiPattern,
    paintCount: dump.paintCount,
    failCount: dump.failCount,
    failList: formatCourseCardFailList(dump.failList),
    tally: dump.tally,
  });
  console.log('[Signal Lab] fairway-research', {
    paint: dump.tally.paint,
    fail: dump.tally.fail,
    reasons: dump.tally.reasons,
    oneOff: dump.tally.oneOff,
    thinTier: dump.tally.thinTier,
    failList: formatCourseCardFailList(dump.failList),
  });
  return dump;
}

/**
 * Doc split: Magnolia + Camden paint; Cypress / Greystone / Pleasant Valley
 * blank when live tee/green are missing. Known hole-1 fixtures still mount.
 */
export function compareMagnoliaCypressHole1(args?: {
  cypressTee?: LatLng | null;
  cypressGreen?: LatLng | null;
  camdenTee?: LatLng | null;
  camdenGreen?: LatLng | null;
  greystoneTee?: LatLng | null;
  greystoneGreen?: LatLng | null;
  pleasantValleyTee?: LatLng | null;
  pleasantValleyGreen?: LatLng | null;
}): {
  magnolia: CourseCardPaintDecision;
  camden: CourseCardPaintDecision;
  cypressKnown: CourseCardPaintDecision;
  cypressLive: CourseCardPaintDecision;
  dump: Hole1PayloadDump;
} {
  const magnolia = decideCourseCardPaint({
    tee: MAGNOLIA_CC.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
    phone: null,
  });
  const camden = decideCourseCardPaint({
    tee: args?.camdenTee ?? CAMDEN_CC.hole1.tee,
    green: args?.camdenGreen ?? CAMDEN_CC.hole1.green,
    phone: null,
  });
  const cypressKnown = decideCourseCardPaint({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: CYPRESS_CREEK_CABOT.hole1.green,
    phone: null,
  });
  const cypressLive = decideCourseCardPaint({
    tee: args?.cypressTee ?? null,
    green: args?.cypressGreen ?? null,
    phone: null,
  });
  const dump = dumpHole1PayloadsSideBySide({
    camden: { tee: args?.camdenTee ?? CAMDEN_CC.hole1.tee, green: args?.camdenGreen ?? CAMDEN_CC.hole1.green },
    cypress: { tee: args?.cypressTee ?? null, green: args?.cypressGreen ?? null },
    greystone: { tee: args?.greystoneTee ?? null, green: args?.greystoneGreen ?? null },
    pleasantValley: { tee: args?.pleasantValleyTee ?? null, green: args?.pleasantValleyGreen ?? null },
  });
  return { magnolia, camden, cypressKnown, cypressLive, dump };
}
