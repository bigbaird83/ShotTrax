import { isCourseCardLatLng, type LatLng } from '../domain/latLng';
import { classifyNineByTwo, courseTeeGreenPasses } from '../domain/nineByTwo';
import type { CourseLayoutSeed } from './layout';
import type { CourseHydrate, CourseHydrateMatch } from './hydrate';
import {
  THUNDERBIRD_HEBER_SPRINGS_AR_KEY,
  isClubhousePin,
  loadCourseHydrate,
  resolveCourseHydrateKey,
} from './hydrate';
import { fetchGolfApiHydrate, type GolfApiFetchDeps } from './golfapi';
import { loadOpenGolfHydrate, resolveOpenGolfHydrateKey } from './opengolf';
import {
  cacheRecordMatchesCourse,
  coursePaintCacheKeys,
  getSharedCoursePaintCache,
  type CoursePaintCache,
  type CoursePaintCacheRecord,
  type CoursePaintHole,
  type CoursePaintSource,
} from './paintCache';
import type { CourseDetail, HoleCourseData } from './types';

/**
 * Course paint waterfall. Paid sources run only after the free card misses.
 *
 * 1. Shared cache (device SQLite + optional JSON host) — hit skips GCA and golfapi
 * 2. OSM / OpenGolf / manual-verified bundle — paint when tee+green pass sanity (9×2 counts)
 * 3. Bundled golfapi seed (already paid; Thunderbird and the other hand cards) — skips GCA
 * 4. GCA Pro — greens, and tees when the payload has them. Scorecard-only is a miss
 * 5. golfapi network — last resort after both hard-miss. Same tee+green sanity. PASS is cached
 *
 * Never invents a tee or a green.
 */
export const COURSE_PAINT_WATERFALL = ['osm', 'gca', 'golfapi'] as const;

export function golfApiIsLastResort(): true {
  return true;
}

export function cacheShortCircuitsPaidSources(): true {
  return true;
}

export type PaintCandidate = {
  source: CoursePaintSource;
  numHoles: number | null;
  holes: CoursePaintHole[];
};

export type CoursePaintHit = {
  ok: true;
  source: CoursePaintSource;
  fromCache: boolean;
  nineByTwo: boolean;
  holes: CoursePaintHole[];
};

export type CoursePaintMiss = {
  ok: false;
  source: null;
  fromCache: false;
  nineByTwo: false;
  holes: [];
};

export type CoursePaintResult = CoursePaintHit | CoursePaintMiss;

export type CoursePaintLoaders = {
  loadOsm: () => Promise<PaintCandidate | null>;
  loadGca: () => Promise<PaintCandidate | null>;
  loadGolfApi: () => Promise<PaintCandidate | null>;
  cache?: CoursePaintCache;
  now?: () => string;
};

function finiteNumHoles(value: number | null | undefined): number | null {
  return value === 9 || value === 18 ? value : null;
}

function pointOrNull(point: LatLng | null | undefined): LatLng | null {
  return isCourseCardLatLng(point) ? { lat: point.lat, lng: point.lng } : null;
}

/** GCA hit: at least one real green. Tees are optional. Scorecard-only (no green) misses. */
export function gcaProCoordsPass(holes: readonly CoursePaintHole[]): boolean {
  return holes.some((hole) => {
    const green = pointOrNull(hole.green);
    return Boolean(green && !isClubhousePin(green));
  });
}

function acceptedGreen(green: LatLng | null | undefined): LatLng | null {
  const point = pointOrNull(green);
  if (!point || isClubhousePin(point)) return null;
  return point;
}

/** Tee paints only when it already exists and passes gates with the green. Never invented. */
function acceptedTee(tee: LatLng | null | undefined, green: LatLng | null | undefined): LatLng | null {
  const teePoint = pointOrNull(tee);
  const greenPoint = acceptedGreen(green);
  if (!teePoint || !greenPoint || isClubhousePin(teePoint)) return null;
  if (!courseTeeGreenPasses([{ hole: 1, tee: teePoint, green: greenPoint }], null).ok) return null;
  return teePoint;
}

function candidatePasses(candidate: PaintCandidate): { ok: boolean; nineByTwo: boolean } {
  if (candidate.source === 'gca') {
    return { ok: gcaProCoordsPass(candidate.holes), nineByTwo: false };
  }
  const verdict = courseTeeGreenPasses(candidate.holes, candidate.numHoles);
  return { ok: verdict.ok, nineByTwo: verdict.ok && verdict.kind === 'nine_by_two' };
}

function recordPasses(record: CoursePaintCacheRecord, course: CourseHydrateMatch): boolean {
  if (!cacheRecordMatchesCourse(record, course)) return false;
  return candidatePasses({
    source: record.source,
    numHoles: record.numHoles,
    holes: record.holes,
  }).ok;
}

function toHoles(hydrate: CourseHydrate): CoursePaintHole[] {
  return hydrate.holes.map((hole) => ({
    hole: hole.hole,
    tee: hole.tee ? { lat: hole.tee.lat, lng: hole.tee.lng } : null,
    green: { lat: hole.green.lat, lng: hole.green.lng },
    par: hole.par,
    yards: hole.yards,
  }));
}

/**
 * Free paint: bundled OSM, manual-verified cards, and OpenGolf centerlines.
 * golfapi bundles stay on the last step so a miss can still try GCA Pro.
 */
export function loadOsmOpenGolfCandidate(course: CourseHydrateMatch): PaintCandidate | null {
  const key = resolveCourseHydrateKey(course);
  const bundled = key ? loadCourseHydrate(key) : null;
  const free = bundled && bundled.source !== 'golfapi' ? bundled : null;
  const ogKey = free ? null : resolveOpenGolfHydrateKey(course);
  const og = ogKey ? loadOpenGolfHydrate(ogKey) : null;
  const hydrate = free ?? (og && og.source !== 'golfapi' ? og : null);
  if (!hydrate || hydrate.holes.length === 0) return null;
  const source: CoursePaintSource = hydrate.source === 'manual_verified' ? 'manual_verified' : 'osm';
  return {
    source,
    numHoles: finiteNumHoles(hydrate.numHoles),
    holes: toHoles(hydrate),
  };
}

/** Already-paid golfapi card (bundle or device cache). No network. */
export function loadBundledGolfApiCandidate(course: CourseHydrateMatch): PaintCandidate | null {
  const key = resolveCourseHydrateKey(course);
  const bundled = key ? loadCourseHydrate(key) : null;
  if (!bundled || bundled.source !== 'golfapi' || bundled.holes.length === 0) return null;
  const numHoles =
    finiteNumHoles(bundled.numHoles) ??
    (bundled.courseKey === THUNDERBIRD_HEBER_SPRINGS_AR_KEY ? 9 : null);
  return { source: 'golfapi', numHoles, holes: toHoles(bundled) };
}

/**
 * Last resort. A bundled/seed card that passes sanity is returned with no
 * network. If that seed was already rejected in this resolve, fetch golfapi
 * instead of returning the same failed card. No key / thin GPS → null.
 */
export async function loadGolfApiPaintCandidate(
  course: CourseHydrateMatch,
  deps: GolfApiFetchDeps = {},
): Promise<PaintCandidate | null> {
  const seeded = loadBundledGolfApiCandidate(course);
  if (seeded && candidatePasses(seeded).ok) return seeded;
  const hydrate = await fetchGolfApiHydrate(course, {
    ...deps,
    skipCache: seeded != null,
  });
  if (!hydrate || hydrate.source !== 'golfapi' || hydrate.holes.length === 0) return null;
  return {
    source: 'golfapi',
    numHoles: finiteNumHoles(hydrate.numHoles),
    holes: toHoles(hydrate),
  };
}

function hitFrom(
  source: CoursePaintSource,
  holes: CoursePaintHole[],
  nineByTwo: boolean,
  fromCache: boolean,
): CoursePaintHit {
  return { ok: true, source, fromCache, nineByTwo, holes };
}

const MISS: CoursePaintMiss = {
  ok: false,
  source: null,
  fromCache: false,
  nineByTwo: false,
  holes: [],
};

async function writePass(
  course: CourseHydrateMatch,
  candidate: PaintCandidate,
  nineByTwo: boolean,
  cache: CoursePaintCache,
  now: () => string,
): Promise<void> {
  const keys = coursePaintCacheKeys(course);
  if (keys.length === 0) return;
  const [key, ...aliases] = keys;
  const record: CoursePaintCacheRecord = {
    v: 1,
    key,
    aliases,
    source: candidate.source,
    name: course.name?.trim() || null,
    city: course.city?.trim() || null,
    numHoles: candidate.numHoles,
    nineByTwo,
    fetchedAt: now(),
    holes: candidate.holes,
  };
  await cache.put(record);
}

/**
 * Resolve tee/green paint for one course.
 * Cache hit returns before any loader runs (0 source calls).
 */
export async function resolveCoursePaint(
  course: CourseHydrateMatch,
  deps: CoursePaintLoaders,
): Promise<CoursePaintResult> {
  const cache = deps.cache ?? getSharedCoursePaintCache();
  const now = deps.now ?? (() => new Date().toISOString());
  for (const key of coursePaintCacheKeys(course)) {
    const cached = await cache.get(key);
    if (cached && recordPasses(cached, course)) {
      const nine =
        cached.nineByTwo ||
        classifyNineByTwo({ numHoles: cached.numHoles, holes: cached.holes }).ok;
      return hitFrom(cached.source, cached.holes, nine, true);
    }
  }

  const osm = await deps.loadOsm();
  if (osm && (osm.source === 'osm' || osm.source === 'manual_verified')) {
    const verdict = candidatePasses(osm);
    if (verdict.ok) {
      await writePass(course, osm, verdict.nineByTwo, cache, now);
      return hitFrom(osm.source, osm.holes, verdict.nineByTwo, false);
    }
  }

  const seeded = loadBundledGolfApiCandidate(course);
  if (seeded) {
    const verdict = candidatePasses(seeded);
    if (verdict.ok) {
      await writePass(course, seeded, verdict.nineByTwo, cache, now);
      return hitFrom('golfapi', seeded.holes, verdict.nineByTwo, true);
    }
  }

  const gca = await deps.loadGca();
  if (gca && gca.source === 'gca') {
    const verdict = candidatePasses({ ...gca, source: 'gca' });
    if (verdict.ok) {
      const nine = classifyNineByTwo({ numHoles: gca.numHoles, holes: gca.holes }).ok;
      await writePass(course, gca, nine, cache, now);
      return hitFrom('gca', gca.holes, nine, false);
    }
  }

  const golf = await deps.loadGolfApi();
  if (golf && golf.source === 'golfapi') {
    const verdict = candidatePasses({ ...golf, source: 'golfapi' });
    if (verdict.ok) {
      await writePass(course, golf, verdict.nineByTwo, cache, now);
      return hitFrom('golfapi', golf.holes, verdict.nineByTwo, false);
    }
  }

  return MISS;
}

function emptyHole(holeNumber: number): HoleCourseData {
  return {
    holeNumber,
    par: null,
    yards: null,
    handicap: null,
    greenCentroid: null,
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
    teeCentroid: null,
  };
}

function paintHole(hole: HoleCourseData, painted: CoursePaintHole | undefined): HoleCourseData {
  if (!painted) return hole;
  const green = acceptedGreen(painted.green);
  const tee = acceptedTee(painted.tee, painted.green ?? hole.greenCentroid);
  return {
    ...hole,
    par: hole.par ?? (painted.par != null ? painted.par : null),
    yards: hole.yards ?? (painted.yards != null ? painted.yards : null),
    greenCentroid: isCourseCardLatLng(hole.greenCentroid) ? hole.greenCentroid : green,
    teeCentroid: isCourseCardLatLng(hole.teeCentroid) ? hole.teeCentroid : tee,
  };
}

/** Fill null tee/green from a paint hit. Existing real coords stay. Never invents. */
export function applyCoursePaintToDetail(detail: CourseDetail, hit: CoursePaintHit): CourseDetail {
  const byHole = new Map(hit.holes.map((hole) => [hole.hole, hole]));
  const numbers = new Set<number>([
    ...detail.holes.map((hole) => hole.holeNumber),
    ...hit.holes.map((hole) => hole.hole),
  ]);
  const holes = [...numbers]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b)
    .map((n) => paintHole(detail.holes.find((hole) => hole.holeNumber === n) ?? emptyHole(n), byHole.get(n)));
  const tees = detail.tees.map((tee) => ({
    ...tee,
    holes: tee.holes.map((hole) => paintHole(hole, byHole.get(hole.holeNumber))),
  }));
  return { ...detail, holes, tees };
}

/** Same fill for a round layout. Existing real coords stay. */
export function applyCoursePaintToLayout(layout: CourseLayoutSeed, hit: CoursePaintHit): CourseLayoutSeed {
  const byHole = new Map(hit.holes.map((hole) => [hole.hole, hole]));
  const existing = layout.holes ?? [];
  const numbers = new Set<number>([...existing.map((hole) => hole.number), ...hit.holes.map((hole) => hole.hole)]);
  const holes = [...numbers]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b)
    .map((n) => {
      const row = existing.find((hole) => hole.number === n);
      const painted = byHole.get(n);
      const paintedGreen = acceptedGreen(painted?.green);
      const paintedTee = acceptedTee(painted?.tee, painted?.green ?? row?.greenCentroid);
      return {
        number: n,
        par: row?.par ?? painted?.par ?? null,
        yards: row?.yards ?? painted?.yards ?? null,
        handicap: row?.handicap ?? null,
        greenCentroid: isCourseCardLatLng(row?.greenCentroid) ? row.greenCentroid : paintedGreen,
        greenFront: row?.greenFront ?? null,
        greenBack: row?.greenBack ?? null,
        greenDepthYards: row?.greenDepthYards ?? null,
        teeCentroid: isCourseCardLatLng(row?.teeCentroid) ? row.teeCentroid : paintedTee,
      };
    });
  return { ...layout, holes };
}

/** True when the layout still has no green and no passing tee+green — golfapi may run. */
export function layoutStillHardMiss(layout: CourseLayoutSeed): boolean {
  const holes = layout.holes ?? [];
  if (holes.length === 0) return true;
  return !holes.some((hole) => {
    const green = isCourseCardLatLng(hole.greenCentroid) ? hole.greenCentroid : null;
    if (!green || isClubhousePin(green)) return false;
    return true;
  });
}
