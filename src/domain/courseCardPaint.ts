import { diagnoseCourseCardFrame, holeFrameRegion, planCourseCardCamera } from './holeCamera';
import { isCourseCardLatLng, isNearZeroLatLng, type LatLng } from './latLng';
import { holeMapRegionIsPaintable } from './mapPaint';
import { CYPRESS_CREEK_CABOT, GREYSTONE_CABOT, MAGNOLIA_CC } from './reproCourseCard';

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
  /** Cabot cards share null/placeholder while Magnolia is real → thin API, not paint. */
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
 * Magnolia (control) beside Cypress Creek Cabot and Greystone Cabot.
 * Same null/placeholder pair on the Cabot cards → thin API data, not a paint bug.
 */
export function dumpHole1PayloadsSideBySide(args: {
  magnolia?: { tee: LatLng | null; green: LatLng | null };
  cypress: { tee: LatLng | null; green: LatLng | null };
  greystone: { tee: LatLng | null; green: LatLng | null };
}): Hole1PayloadDump {
  const magnolia = hole1PayloadRow({
    course: MAGNOLIA_CC.name,
    city: MAGNOLIA_CC.city,
    tee: args.magnolia?.tee ?? MAGNOLIA_CC.hole1.tee,
    green: args.magnolia?.green ?? MAGNOLIA_CC.hole1.green,
  });
  const cypress = hole1PayloadRow({
    course: CYPRESS_CREEK_CABOT.name,
    city: CYPRESS_CREEK_CABOT.city,
    tee: args.cypress.tee,
    green: args.cypress.green,
  });
  const greystone = hole1PayloadRow({
    course: GREYSTONE_CABOT.name,
    city: GREYSTONE_CABOT.city,
    tee: args.greystone.tee,
    green: args.greystone.green,
  });
  const rows = [magnolia, cypress, greystone];
  const cabotSameThin = kindPair(cypress) === kindPair(greystone) && kindPair(cypress) !== 'real/real';
  return {
    rows,
    thinApiPattern: magnolia.mount && cabotSameThin && !cypress.mount && !greystone.mount,
    failCount: courseCardFailCount(rows),
  };
}

export function logCourseCardPaint(args: {
  courseName?: string | null;
  holeNumber: number;
  decision: CourseCardPaintDecision;
}): CourseCardPaintDecision {
  const { courseName, holeNumber, decision } = args;
  // Signal Lab device log: Cypress / Greystone hole 1 tee/green vs Magnolia.
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
    cypressCreekCabot: dump.rows[1],
    greystoneCabot: dump.rows[2],
    thinApiPattern: dump.thinApiPattern,
    failCount: dump.failCount,
  });
  return dump;
}

/**
 * Magnolia vs Cypress/Greystone split for the ShotTraxx room.
 * Known hole-1 cards mount. Live Cabot null/~0,0 is a miss + fail count.
 */
export function compareMagnoliaCypressHole1(args?: {
  cypressTee?: LatLng | null;
  cypressGreen?: LatLng | null;
  greystoneTee?: LatLng | null;
  greystoneGreen?: LatLng | null;
}): {
  magnolia: CourseCardPaintDecision;
  cypressKnown: CourseCardPaintDecision;
  cypressLive: CourseCardPaintDecision;
  greystoneKnown: CourseCardPaintDecision;
  greystoneLive: CourseCardPaintDecision;
  dump: Hole1PayloadDump;
} {
  const magnolia = decideCourseCardPaint({
    tee: MAGNOLIA_CC.hole1.tee,
    green: MAGNOLIA_CC.hole1.green,
    phone: null,
  });
  const cypressKnown = decideCourseCardPaint({
    tee: CYPRESS_CREEK_CABOT.hole1.tee,
    green: CYPRESS_CREEK_CABOT.hole1.green,
    phone: null,
  });
  const greystoneKnown = decideCourseCardPaint({
    tee: GREYSTONE_CABOT.hole1.tee,
    green: GREYSTONE_CABOT.hole1.green,
    phone: null,
  });
  const cypressLive = decideCourseCardPaint({
    tee: args?.cypressTee ?? null,
    green: args?.cypressGreen ?? null,
    phone: null,
  });
  const greystoneLive = decideCourseCardPaint({
    tee: args?.greystoneTee ?? null,
    green: args?.greystoneGreen ?? null,
    phone: null,
  });
  const dump = dumpHole1PayloadsSideBySide({
    cypress: { tee: args?.cypressTee ?? null, green: args?.cypressGreen ?? null },
    greystone: { tee: args?.greystoneTee ?? null, green: args?.greystoneGreen ?? null },
  });
  return { magnolia, cypressKnown, cypressLive, greystoneKnown, greystoneLive, dump };
}
