/**
 * Thunderbird Country Club (Heber Springs) pin-force.
 *
 * The bundled golfapi seed (courseID 011141520629948893391) painted wrong
 * tees and greens on TF 69. That card must not win from the seed, from
 * `settings.golfapi.hydrates`, from `settings.course.paint.cache`, or from
 * a live golfapi fetch.
 *
 * Next paint is OSM (if mapped) or a Doc pin-sheet that already has a green.
 * Pin sheets do not invent a green.
 */

export const THUNDERBIRD_HEBER_SPRINGS_COURSE_KEY = 'thunderbird-heber-springs-ar';

/** golfapi.io course that shipped the wrong tees and greens. */
export const THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID = '011141520629948893391';

export function thunderbirdGolfApiPaintBlocked(): true {
  return true;
}

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isThunderbirdHeberSpringsIdentity(course: {
  courseKey?: string | null;
  name?: string | null;
  displayName?: string | null;
  city?: string | null;
  state?: string | null;
  locality?: string | null;
  sourceRef?: string | null;
}): boolean {
  const rawKey = (course.courseKey ?? '').trim();
  const key = rawKey.replace(/^id:/i, '').replace(/^local:/i, '');
  if (
    key === THUNDERBIRD_HEBER_SPRINGS_COURSE_KEY ||
    rawKey.includes(THUNDERBIRD_HEBER_SPRINGS_COURSE_KEY)
  ) {
    return true;
  }
  if (rawKey.includes(THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID)) return true;
  if ((course.sourceRef ?? '').includes(THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID)) return true;
  const name = norm(course.name ?? course.displayName);
  if (!/\bthunderbird\b/.test(name)) return false;
  const bag = [name, norm(course.city), norm(course.state), norm(course.locality)].join(' ');
  if (/\bcabot\b/.test(bag) || /little rock/.test(bag) || /fairfield/.test(bag) || /rancho/.test(bag)) {
    return false;
  }
  if (/heber springs/.test(bag)) return true;
  if (/\bheber\b/.test(bag) && (/\bar\b/.test(bag) || /\barkansas\b/.test(bag))) return true;
  return false;
}

/** Device paint-cache rows that would put the poisoned card back on the map. OSM stays. */
export function thunderbirdPaintCacheRecordBlocked(record: {
  key?: string | null;
  aliases?: readonly string[] | null;
  source?: string | null;
  name?: string | null;
  city?: string | null;
}): boolean {
  if (record.source === 'osm' || record.source === 'manual_verified') return false;
  const blob = [record.key, ...(record.aliases ?? []), record.name, record.city]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  if (blob.includes(THUNDERBIRD_HEBER_SPRINGS_COURSE_KEY)) return true;
  if (blob.includes(THUNDERBIRD_POISONED_GOLFAPI_COURSE_ID)) return true;
  if (
    isThunderbirdHeberSpringsIdentity({
      courseKey: record.key,
      name: record.name,
      city: record.city,
      sourceRef: blob,
    })
  ) {
    return true;
  }
  const folded = norm(blob);
  return folded.includes('thunderbird country club') && folded.includes('heber springs');
}
