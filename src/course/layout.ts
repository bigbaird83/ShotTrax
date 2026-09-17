import { pinOrNull, type GreenDepthPins } from '../domain/greenDepth';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { GreenSource } from '../domain/types';
import type { CourseDetail, HoleCourseData, TeeSet } from './types';

export {
  formatHoleHeader,
  formatParLabel,
  formatSiLabel,
  formatTeeMeta,
} from '../domain/playerCopy';

export type CourseLayoutSeed = {
  apiId: string | null;
  name?: string | null;
  location?: LatLng | null;
  teeName?: string | null;
  teeRating?: number | null;
  teeSlope?: number | null;
  teeTotalYards?: number | null;
  holes?: Array<{
    number: number;
    par: number | null;
    yards: number | null;
    handicap: number | null;
    greenCentroid: LatLng | null;
    greenFront?: LatLng | null;
    greenBack?: LatLng | null;
    greenDepthYards?: number | null;
  }>;
};

export type AppliedHoleLayout = {
  par: number | null;
  parSource: 'course' | 'user' | null;
  yards: number | null;
  handicap: number | null;
  green: LatLng | null;
  greenSource: GreenSource | null;
  greenFront: LatLng | null;
  greenBack: LatLng | null;
  greenDepthYards: number | null;
};

/** Round length from course hole_count when it is 9 or 18. Never invents par/green. */
export function roundHoleCountFromCourse(holeCount: number | null, fallback: 9 | 18 = 18): 9 | 18 {
  if (holeCount === 9) return 9;
  if (holeCount === 18) return 18;
  return fallback;
}

export function layoutFromTee(detail: CourseDetail, tee: TeeSet | null): CourseLayoutSeed {
  const holes = tee?.holes ?? detail.holes;
  return {
    apiId: detail.id,
    name: detail.name,
    location: isValidLatLng(detail.location) ? detail.location : null,
    teeName: tee?.name ?? null,
    teeRating: tee?.rating ?? null,
    teeSlope: tee?.slope ?? null,
    teeTotalYards: tee?.totalYards ?? null,
    holes: holes.map((hole) => {
      const fromDetail = detail.holes.find((row) => row.holeNumber === hole.holeNumber);
      return {
        number: hole.holeNumber,
        par: hole.par,
        yards: hole.yards,
        handicap: hole.handicap,
        greenCentroid: isValidLatLng(hole.greenCentroid)
          ? hole.greenCentroid
          : fromDetail?.greenCentroid ?? null,
        greenFront: pinOrNull(hole.greenFront) ?? pinOrNull(fromDetail?.greenFront),
        greenBack: pinOrNull(hole.greenBack) ?? pinOrNull(fromDetail?.greenBack),
        greenDepthYards: hole.greenDepthYards ?? fromDetail?.greenDepthYards ?? null,
      };
    }),
  };
}

export function layoutFromCourseDetail(detail: CourseDetail, tee?: TeeSet | null): CourseLayoutSeed {
  return layoutFromTee(detail, tee ?? detail.tees[0] ?? null);
}

export function layoutFromHoles(
  apiId: string,
  holes: HoleCourseData[],
  extra?: { name?: string | null; location?: LatLng | null },
): CourseLayoutSeed {
  return {
    apiId,
    name: extra?.name ?? null,
    location: extra?.location ?? null,
    holes: holes.map((hole) => ({
      number: hole.holeNumber,
      par: hole.par,
      yards: hole.yards,
      handicap: hole.handicap,
      greenCentroid: hole.greenCentroid,
      greenFront: hole.greenFront,
      greenBack: hole.greenBack,
      greenDepthYards: hole.greenDepthYards,
    })),
  };
}

/** New hole: apply API par/green/SI/yards only when present. Never default par to 4. */
export function seedHoleFromCourse(seed?: {
  par: number | null;
  yards?: number | null;
  handicap?: number | null;
  greenCentroid: LatLng | null;
  greenFront?: LatLng | null;
  greenBack?: LatLng | null;
  greenDepthYards?: number | null;
} | null): AppliedHoleLayout {
  const par = seed?.par ?? null;
  const green = isValidLatLng(seed?.greenCentroid) ? seed.greenCentroid : null;
  return {
    par,
    parSource: par != null ? 'course' : null,
    yards: seed?.yards ?? null,
    handicap: seed?.handicap ?? null,
    green,
    greenSource: green ? 'course_centroid' : null,
    greenFront: pinOrNull(seed?.greenFront),
    greenBack: pinOrNull(seed?.greenBack),
    greenDepthYards: seed?.greenDepthYards ?? null,
  };
}

/**
 * Attach to an existing hole: fill blank par/green from the course.
 * User-set par is kept. SI and tee yards always come from the selected tee
 * (course data only) — missing stays blank. Never invent.
 */
export function attachHoleFromCourse(
  existing: {
    par: number | null;
    parSource: 'course' | 'user' | null;
    greenLat: number | null;
    greenLng: number | null;
    greenSource: GreenSource | null;
  },
  seed?: {
    par: number | null;
    yards?: number | null;
    handicap?: number | null;
    greenCentroid: LatLng | null;
    greenFront?: LatLng | null;
    greenBack?: LatLng | null;
    greenDepthYards?: number | null;
  } | null,
): AppliedHoleLayout {
  const incoming = seedHoleFromCourse(seed);
  const existingGreen = isValidLatLng(
    existing.greenLat != null && existing.greenLng != null
      ? { lat: existing.greenLat, lng: existing.greenLng }
      : null,
  )
    ? { lat: existing.greenLat as number, lng: existing.greenLng as number }
    : null;

  const keepPar = existing.parSource === 'user' && existing.par != null;
  const keepGreen = existingGreen != null && existing.greenSource === 'user_estimate';

  return {
    par: keepPar ? existing.par : incoming.par,
    parSource: keepPar ? 'user' : incoming.parSource,
    yards: incoming.yards,
    handicap: incoming.handicap,
    green: keepGreen ? existingGreen : incoming.green ?? existingGreen,
    greenSource: keepGreen
      ? 'user_estimate'
      : incoming.greenSource ?? (existingGreen ? existing.greenSource : null),
    greenFront: incoming.greenFront,
    greenBack: incoming.greenBack,
    greenDepthYards: incoming.greenDepthYards,
  };
}

export function holeGreenDepth(seed: {
  greenCentroid?: LatLng | null;
  greenFront?: LatLng | null;
  greenBack?: LatLng | null;
  greenDepthYards?: number | null;
}): GreenDepthPins {
  return {
    front: pinOrNull(seed.greenFront),
    middle: pinOrNull(seed.greenCentroid),
    back: pinOrNull(seed.greenBack),
    depthYards: seed.greenDepthYards ?? null,
  };
}

/** Per-hole tee yardage. Missing holes are “—”; omit the line if none have yards. Never sums a total. */
export function formatTeeHoleYards(
  holes: Array<{ holeNumber: number; yards: number | null }>,
): string | null {
  if (!holes.some((hole) => hole.yards != null)) return null;
  return holes.map((hole) => `${hole.holeNumber} ${hole.yards ?? '—'}`).join(' · ');
}
