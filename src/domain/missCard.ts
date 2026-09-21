import { matchesThunderbirdHeberSprings } from '../course/hydrate';
import { isValidLatLng, type LatLng } from './latLng';
import { COPY } from './playerCopy';

export type MissCardCopy = {
  title: string;
  detail: string | null;
};

/** Thunderbird Heber Springs (and any future HARD-MISS catalog) — never invented pins. */
export function courseNeedsPinSheets(course: {
  courseKey?: string | null;
  courseApiId?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  location?: LatLng | null;
}): boolean {
  const raw = (course.courseKey ?? course.courseApiId ?? '').trim();
  const courseKey = raw.replace(/^local:/i, '') || null;
  const location = isValidLatLng(course.location) ? course.location : null;
  return matchesThunderbirdHeberSprings({
    courseKey,
    name: course.name,
    city: course.city,
    state: course.state,
    locality: course.locality,
    location,
  });
}

export function planMissCardCopy(args: { needPins?: boolean }): MissCardCopy {
  if (args.needPins) {
    return {
      title: COPY.hardMissNeedPins,
      detail: COPY.hardMissNeedPinsDetail,
    };
  }
  return {
    title: COPY.courseCardMissingFrame,
    detail: null,
  };
}

export function missCardInventsPins(): false {
  return false;
}

export function thunderbirdPinsAreBlocked(): false {
  return false;
}

export function thunderbirdTeesAreBlocked(): true {
  return true;
}
