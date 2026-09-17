import { isValidLatLng, type LatLng } from '../domain/latLng';
import type { GreenSource } from '../domain/types';
import type { CourseDetail, HoleCourseData } from './types';

export type CourseLayoutSeed = {
  apiId: string | null;
  name?: string | null;
  location?: LatLng | null;
  holes?: Array<{
    number: number;
    par: number | null;
    greenCentroid: LatLng | null;
  }>;
};

export type AppliedHoleLayout = {
  par: number | null;
  parSource: 'course' | 'user' | null;
  green: LatLng | null;
  greenSource: GreenSource | null;
};

/** Round length from course hole_count when it is 9 or 18. Never invents par/green. */
export function roundHoleCountFromCourse(holeCount: number | null, fallback: 9 | 18 = 18): 9 | 18 {
  if (holeCount === 9) return 9;
  if (holeCount === 18) return 18;
  return fallback;
}

export function layoutFromCourseDetail(detail: CourseDetail): CourseLayoutSeed {
  return {
    apiId: detail.id,
    name: detail.name,
    location: isValidLatLng(detail.location) ? detail.location : null,
    holes: detail.holes.map((hole) => ({
      number: hole.holeNumber,
      par: hole.par,
      greenCentroid: isValidLatLng(hole.greenCentroid) ? hole.greenCentroid : null,
    })),
  };
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
      greenCentroid: hole.greenCentroid,
    })),
  };
}

/** New hole: apply API par/green only when present. Never default par to 4. */
export function seedHoleFromCourse(seed?: {
  par: number | null;
  greenCentroid: LatLng | null;
} | null): AppliedHoleLayout {
  const par = seed?.par ?? null;
  const green = isValidLatLng(seed?.greenCentroid) ? seed.greenCentroid : null;
  return {
    par,
    parSource: par != null ? 'course' : null,
    green,
    greenSource: green ? 'course_centroid' : null,
  };
}

/**
 * Attach to an existing hole: fill blank par/green from the course.
 * Never overwrite a user par, user green, or already-applied course values.
 * Never invent.
 */
export function attachHoleFromCourse(
  existing: {
    par: number | null;
    parSource: 'course' | 'user' | null;
    greenLat: number | null;
    greenLng: number | null;
    greenSource: GreenSource | null;
  },
  seed?: { par: number | null; greenCentroid: LatLng | null } | null,
): AppliedHoleLayout {
  const incoming = seedHoleFromCourse(seed);
  const existingGreen = isValidLatLng(
    existing.greenLat != null && existing.greenLng != null
      ? { lat: existing.greenLat, lng: existing.greenLng }
      : null,
  )
    ? { lat: existing.greenLat as number, lng: existing.greenLng as number }
    : null;

  const keepPar = existing.par != null;
  const keepGreen = existingGreen != null;

  return {
    par: keepPar ? existing.par : incoming.par,
    parSource: keepPar ? (existing.parSource ?? 'user') : incoming.parSource,
    green: keepGreen ? existingGreen : incoming.green,
    greenSource: keepGreen ? (existing.greenSource ?? 'user_estimate') : incoming.greenSource,
  };
}

export function formatParLabel(par: number | null): string {
  return par == null ? 'par ?' : `Par ${par}`;
}
