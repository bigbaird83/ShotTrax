import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { GreenSource } from '../domain/types';
import type { CourseDetail, HoleCourseData, TeeSet } from './types';

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
  }>;
};

export type AppliedHoleLayout = {
  par: number | null;
  parSource: 'course' | 'user' | null;
  yards: number | null;
  handicap: number | null;
  green: LatLng | null;
  greenSource: GreenSource | null;
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
    holes: holes.map((hole) => ({
      number: hole.holeNumber,
      par: hole.par,
      yards: hole.yards,
      handicap: hole.handicap,
      greenCentroid: isValidLatLng(hole.greenCentroid)
        ? hole.greenCentroid
        : detail.holes.find((row) => row.holeNumber === hole.holeNumber)?.greenCentroid ?? null,
    })),
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
    })),
  };
}

/** New hole: apply API par/green/SI/yards only when present. Never default par to 4. */
export function seedHoleFromCourse(seed?: {
  par: number | null;
  yards?: number | null;
  handicap?: number | null;
  greenCentroid: LatLng | null;
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
  };
}

export function formatParLabel(par: number | null): string {
  return par == null ? 'par ?' : `Par ${par}`;
}

export function formatSiLabel(handicap: number | null): string {
  return handicap == null ? 'SI ?' : `SI ${handicap}`;
}

export function formatTeeMeta(tee: {
  name: string;
  rating: number | null;
  slope: number | null;
  totalYards: number | null;
}): string {
  const bits = [
    tee.rating != null ? String(tee.rating) : null,
    tee.slope != null ? `slope ${tee.slope}` : null,
    tee.totalYards != null ? `${tee.totalYards} yd` : null,
  ].filter(Boolean);
  return bits.length ? `${tee.name} · ${bits.join(' · ')}` : tee.name;
}
