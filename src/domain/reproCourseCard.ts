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

/**
 * Doc TF control — paints like Magnolia. Camden, AR.
 * Known hole-1 tee+green for camera tests, never invented at runtime.
 */
export const CAMDEN_CC: ReproCourseCard = {
  name: 'Camden Country Club',
  city: 'Camden',
  state: 'AR',
  location: { lat: 33.5826, lng: -92.8734 },
  hole1: {
    number: 1,
    tee: { lat: 33.5808, lng: -92.8752 },
    green: { lat: 33.5844, lng: -92.8716 },
  },
};

/** Doc TF blank — Cypress-specific. Cabot, AR. Missing live tee/green → miss card. */
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

/**
 * Cabot neighbor of Cypress Creek. Same thin-API class when hole 1
 * tee/green are null or ~0,0 — never invent a green from the clubhouse.
 */
export const GREYSTONE_CABOT: ReproCourseCard = {
  name: 'Greystone Country Club',
  city: 'Cabot',
  state: 'AR',
  location: { lat: 35.0205, lng: -92.0638 },
  hole1: {
    number: 1,
    tee: { lat: 35.0188, lng: -92.0652 },
    green: { lat: 35.0224, lng: -92.061 },
  },
};

/** Third Doc repro — El Dorado. Same blank-map class as Magnolia and Cypress. */
export const MYSTIC_CREEK_EL_DORADO: ReproCourseCard = {
  name: 'Mystic Creek',
  city: 'El Dorado',
  state: 'AR',
  location: { lat: 33.224, lng: -92.74 },
  hole1: {
    number: 1,
    tee: { lat: 33.2218, lng: -92.7422 },
    green: { lat: 33.2256, lng: -92.7388 },
  },
};

export const REPRO_COURSE_CARDS = [MAGNOLIA_CC, CYPRESS_CREEK_CABOT, MYSTIC_CREEK_EL_DORADO] as const;

/** Doc-confirmed paint split: these two paint; Cypress blanks when the card is thin. */
export const PAINTS_REPRO_CARDS = [MAGNOLIA_CC, CAMDEN_CC] as const;

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

export function cypressCreekHole1Card(): { tee: LatLng; green: LatLng } {
  return { tee: CYPRESS_CREEK_CABOT.hole1.tee, green: CYPRESS_CREEK_CABOT.hole1.green };
}

export function mysticCreekHole1Card(): { tee: LatLng; green: LatLng } {
  return { tee: MYSTIC_CREEK_EL_DORADO.hole1.tee, green: MYSTIC_CREEK_EL_DORADO.hole1.green };
}

export function greystoneHole1Card(): { tee: LatLng; green: LatLng } {
  return { tee: GREYSTONE_CABOT.hole1.tee, green: GREYSTONE_CABOT.hole1.green };
}

export function camdenHole1Card(): { tee: LatLng; green: LatLng } {
  return { tee: CAMDEN_CC.hole1.tee, green: CAMDEN_CC.hole1.green };
}
