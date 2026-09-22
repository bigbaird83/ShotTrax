import { hydrateHolePassesGates } from '../course/hydrate';
import { courseIsHardMiss, type CourseIdentity } from './favorites';
import type { LatLng } from './latLng';

/**
 * Course requests are a queue plus a user-opened email composer.
 * They never paint a hole and they never send mail by themselves.
 *
 * The button shows only for a HARD-MISS card or a card with no tee/green paint.
 * Real tee/green map data hides it.
 */

export function holesHaveTeeGreenPaint(
  holes:
    | ReadonlyArray<{
        tee?: LatLng | null;
        green?: LatLng | null;
        teeCentroid?: LatLng | null;
        greenCentroid?: LatLng | null;
      }>
    | null
    | undefined,
): boolean {
  return (holes ?? []).some((hole) =>
    hydrateHolePassesGates({
      tee: hole.tee ?? hole.teeCentroid ?? null,
      green: hole.green ?? hole.greenCentroid ?? null,
    }),
  );
}

export function requestThisCourseVisible(args: {
  course?: CourseIdentity | null;
  hasTeeGreenPaint: boolean;
  paintKnown?: boolean;
}): boolean {
  if (args.hasTeeGreenPaint) return false;
  if (args.course && courseIsHardMiss(args.course)) return true;
  return args.paintKnown === true && !args.hasTeeGreenPaint;
}

export const SHOTTRAXX_CONTACT_EMAIL = 'ShotTraxx@gmail.com';
export const SHOTTRAXX_X_HANDLE = '@ShotTraxx';
export const COURSE_REQUESTS_SETTING_KEY = 'course.requests';

export type JsonStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type CourseRequestPayload = {
  name: string;
  city: string;
  notes: string;
  requestedAt: string;
  email: typeof SHOTTRAXX_CONTACT_EMAIL;
  handle: typeof SHOTTRAXX_X_HANDLE;
};

export function courseRequestMutatesPaint(): false {
  return false;
}

export function courseRequestSendsWithoutConfirm(): false {
  return false;
}

export function buildCourseRequest(input: {
  name: string;
  city?: string | null;
  notes?: string | null;
  now?: string;
}): CourseRequestPayload | null {
  const name = input.name.trim();
  if (!name) return null;
  const requestedAt = (input.now ?? new Date().toISOString()).trim();
  if (!requestedAt) return null;
  return {
    name,
    city: (input.city ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    requestedAt,
    email: SHOTTRAXX_CONTACT_EMAIL,
    handle: SHOTTRAXX_X_HANDLE,
  };
}

export function courseRequestSubject(payload: CourseRequestPayload): string {
  const place = payload.city ? ` — ${payload.city}` : '';
  return `Course request: ${payload.name}${place}`;
}

export function courseRequestBody(payload: CourseRequestPayload): string {
  return [
    `Course: ${payload.name}`,
    `City: ${payload.city || '—'}`,
    `Notes: ${payload.notes || '—'}`,
    `Requested: ${payload.requestedAt}`,
    `Email: ${payload.email}`,
    `X: ${payload.handle}`,
  ].join('\n');
}

/** Composer URL. Opening it is the user's tap. The app does not send. */
export function courseRequestMailto(payload: CourseRequestPayload): string {
  const subject = encodeURIComponent(courseRequestSubject(payload));
  const body = encodeURIComponent(courseRequestBody(payload));
  return `mailto:${payload.email}?subject=${subject}&body=${body}`;
}

export function listCourseRequests(store: JsonStore): CourseRequestPayload[] {
  const raw = store.get(COURSE_REQUESTS_SETTING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CourseRequestPayload[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<CourseRequestPayload>;
      if (typeof row.name !== 'string' || typeof row.requestedAt !== 'string') continue;
      const built = buildCourseRequest({
        name: row.name,
        city: typeof row.city === 'string' ? row.city : '',
        notes: typeof row.notes === 'string' ? row.notes : '',
        now: row.requestedAt,
      });
      if (built) out.push(built);
    }
    return out;
  } catch {
    return [];
  }
}

/** Append the request. Does not touch paint, cache, or the network. */
export function queueCourseRequest(store: JsonStore, payload: CourseRequestPayload): CourseRequestPayload[] {
  const next = [...listCourseRequests(store), payload];
  store.set(COURSE_REQUESTS_SETTING_KEY, JSON.stringify(next));
  return next;
}
