import { diagnoseCourseCardFrame } from './holeCamera';
import { type LatLng } from './latLng';

export type ReproCourseHole = {
  number: number;
  tee: LatLng;
  green: LatLng;
};

export type ReproCourseCard = {
  name: string;
  city: string;
  state: 'AR';
  location: LatLng;
  hole1: ReproCourseHole;
};

/**
 * Doc's long-running TestFlight repro course.
 * Known tee + green for hole 1 — used to verify camera/layout, never invented at runtime.
 */
export const MAGNOLIA_CC: ReproCourseCard = {
  name: 'Magnolia Country Club',
  city: 'Magnolia',
  state: 'AR',
  location: { lat: 33.2672, lng: -93.2394 },
  hole1: {
    number: 1,
    tee: { lat: 33.2708, lng: -93.2412 },
    green: { lat: 33.2741, lng: -93.2396 },
  },
};

/** Second Doc repro — same blank-map class, not a Magnolia-only card miss. */
export const CYPRESS_CREEK_CABOT: ReproCourseCard = {
  name: 'Cypress Creek',
  city: 'Cabot',
  state: 'AR',
  location: { lat: 34.9748, lng: -92.0168 },
  hole1: {
    number: 1,
    tee: { lat: 34.9732, lng: -92.0184 },
    green: { lat: 34.9764, lng: -92.0151 },
  },
};

export const REPRO_COURSE_CARDS = [MAGNOLIA_CC, CYPRESS_CREEK_CABOT] as const;

/** Course-card hole can frame only when both tee and green are real coordinates. */
export function courseCardHoleHasTeeAndGreen(hole: {
  tee?: LatLng | null;
  green?: LatLng | null;
}): boolean {
  return diagnoseCourseCardFrame({
    tee: hole.tee ?? null,
    green: hole.green ?? null,
    phone: null,
  }).ok;
}

export function magnoliaHole1Card(): { tee: LatLng; green: LatLng } {
  return { tee: MAGNOLIA_CC.hole1.tee, green: MAGNOLIA_CC.hole1.green };
}
