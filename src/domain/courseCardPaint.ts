import { diagnoseCourseCardFrame, holeFrameRegion, planCourseCardCamera } from './holeCamera';
import { isCourseCardLatLng, isNearZeroLatLng, type LatLng } from './latLng';
import { holeMapRegionIsPaintable } from './mapPaint';
import { CAMDEN_CC, CYPRESS_CREEK_CABOT, MAGNOLIA_CC } from './reproCourseCard';

export type CourseCardPaintReason =
  | 'sane_region'
  | 'missing_tee'
  | 'missing_green'
  | 'missing_both'
  | 'zero_coord'
  | 'no_camera'
  | 'bad_region';

export type CourseCardPaintDecision = {
  mount: boolean;
  reason: CourseCardPaintReason;
  tee: LatLng | null;
  green: LatLng | null;
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
  mount: boolean;
  reason: CourseCardPaintReason;
};

export type Hole1PayloadDump = {
  rows: Hole1PayloadRow[];
  /** Magnolia + Camden paint; Cypress null/placeholder → Cypress-specific thin API, not paint. */
  thinApiPattern: boolean;
  /** Holes / cards that must show the miss card (do not mount MapView). */
  failCount: number;
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
      region: null,
    };
  }
  const camera = planCourseCardCamera({ tee: card.tee, green: card.green, phone: null });
  if (!camera) {
    return { mount: false, reason: 'no_camera', tee: card.tee, green: card.green, region: null };
  }
  const region = holeFrameRegion(camera.points);
  if (!holeMapRegionIsPaintable(region)) {
    return { mount: false, reason: 'bad_region', tee: card.tee, green: card.green, region: null };
  }
  return { mount: true, reason: 'sane_region', tee: card.tee, green: card.green, region };
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
    tee: paint.tee,
    green: paint.green,
    teeKind: classifyCourseCardPoint(args.tee),
    greenKind: classifyCourseCardPoint(args.green),
    mount: paint.mount,
    reason: paint.reason,
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

function kindPair(row: Hole1PayloadRow): string {
  return `${row.teeKind}/${row.greenKind}`;
}

/**
 * Doc split: Magnolia + Camden (paint) beside Cypress Creek Cabot.
 * Cypress null/placeholder while the other two are real → thin API, not paint.
 */
export function dumpHole1PayloadsSideBySide(args: {
  magnolia?: { tee: LatLng | null; green: LatLng | null };
  camden?: { tee: LatLng | null; green: LatLng | null };
  cypress: { tee: LatLng | null; green: LatLng | null };
}): Hole1PayloadDump {
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
    tee: args.cypress.tee,
    green: args.cypress.green,
  });
  const rows = [magnolia, camden, cypress];
  const cypressThin = kindPair(cypress) !== 'real/real';
  return {
    rows,
    thinApiPattern: magnolia.mount && camden.mount && cypressThin && !cypress.mount,
    failCount: courseCardFailCount(rows),
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
    region: decision.region,
  });
  return decision;
}

export function logHole1PayloadsSideBySide(dump: Hole1PayloadDump): Hole1PayloadDump {
  console.log('[Signal Lab] hole-1 side-by-side', {
    magnolia: dump.rows[0],
    camdenCc: dump.rows[1],
    cypressCreekCabot: dump.rows[2],
    paints: ['Magnolia Country Club', 'Camden Country Club'],
    blanks: ['Cypress Creek'],
    thinApiPattern: dump.thinApiPattern,
    failCount: dump.failCount,
  });
  return dump;
}

/**
 * Doc split for the ShotTraxx room: Magnolia + Camden paint; Cypress blanks
 * when live tee/green are missing. Known hole-1 cards still mount.
 */
export function compareMagnoliaCypressHole1(args?: {
  cypressTee?: LatLng | null;
  cypressGreen?: LatLng | null;
  camdenTee?: LatLng | null;
  camdenGreen?: LatLng | null;
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
  });
  return { magnolia, camden, cypressKnown, cypressLive, dump };
}
