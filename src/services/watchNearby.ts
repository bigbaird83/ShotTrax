import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCourseDataClient } from '@/src/course/client';
import type { CourseDetail, CourseSummary } from '@/src/course/types';
import { layoutFromTee, roundHoleCountFromCourse } from '@/src/course/layout';
import { startRound } from '@/src/db/repo';
import type { GpsFix } from '@/src/domain/types';
import {
  nearbyCoursesPayload,
  nearbyTeesPayload,
  phoneFixForNearbyCourses,
  planNearbyCourses,
} from '@/src/domain/watchNearby';
import {
  PHONE_UNAVAILABLE,
  parseNearbyCoursePick,
  parseNearbyRequest,
  parseStartRound,
  type NearbyCoursesMessage,
  type NearbyTeesMessage,
} from '@/src/domain/watchMessages';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { getLastLiveFix } from './useLiveFix';
import { getCurrentFix } from './location';

export type WatchNearbyContext = {
  db: SQLiteDatabase;
  bump: () => void;
  phoneFix: () => GpsFix | null;
  hasActiveRound: () => boolean;
  nowMs?: () => number;
};

let context: WatchNearbyContext | null = null;
let lastNearbyJson = '';
let replaceLiveRoundAllowed = false;
let coursePickedHandler: ((pick: { course: CourseSummary; detail: CourseDetail }) => void) | null =
  null;

export function setWatchCoursePickedHandler(
  fn: ((pick: { course: CourseSummary; detail: CourseDetail }) => void) | null,
): void {
  coursePickedHandler = fn;
}

function summaryFromDetail(detail: CourseDetail): CourseSummary {
  return {
    id: detail.id,
    name: detail.name,
    club: null,
    city: null,
    state: null,
    country: null,
    location: detail.location,
    distanceMeters: null,
  };
}

export function setWatchNearbyContext(next: WatchNearbyContext | null): void {
  context = next;
}

function native() {
  return getWatchBridgeNative();
}

async function pushNearbyJson(msg: NearbyCoursesMessage | NearbyTeesMessage): Promise<void> {
  const json = JSON.stringify(msg);
  if (msg.type === 'nearbyCourses' && json === lastNearbyJson) return;
  const mod = native();
  if (!mod) return;
  try {
    if (msg.type === 'nearbyCourses') {
      await mod.pushClubListJson(json);
      lastNearbyJson = json;
    } else if (typeof mod.pushWatchMessageJson === 'function') {
      await mod.pushWatchMessageJson(json);
    } else {
      await mod.pushClubListJson(json);
    }
  } catch {
    // Watch is best-effort on Simulator / Android / web.
  }
}

async function resolvePhoneFix(ctx: WatchNearbyContext): Promise<GpsFix | null> {
  const live = ctx.phoneFix() ?? getLastLiveFix();
  const nowMs = ctx.nowMs?.() ?? Date.now();
  if (phoneFixForNearbyCourses({ phoneFix: live, nowMs })) return live;
  try {
    const fresh = await getCurrentFix();
    if (phoneFixForNearbyCourses({ phoneFix: fresh, nowMs: ctx.nowMs?.() ?? Date.now() })) {
      return fresh;
    }
  } catch {
    // Permission off or no sample — open the phone.
  }
  return live;
}

export async function pushWatchNearbyCourses(opts?: {
  allowDuringRound?: boolean;
}): Promise<NearbyCoursesMessage> {
  const ctx = context;
  const nowMs = ctx?.nowMs?.() ?? Date.now();
  if (!ctx) {
    const plan = planNearbyCourses({ phoneFix: null, courses: [], nowMs });
    const msg = nearbyCoursesPayload(plan);
    await pushNearbyJson(msg);
    return msg;
  }
  replaceLiveRoundAllowed = Boolean(opts?.allowDuringRound);
  if (ctx.hasActiveRound() && !opts?.allowDuringRound) {
    const plan = planNearbyCourses({ phoneFix: null, courses: [], nowMs });
    return nearbyCoursesPayload(plan);
  }
  const phoneFix = await resolvePhoneFix(ctx);
  const chosen = phoneFixForNearbyCourses({ phoneFix, nowMs: ctx.nowMs?.() ?? Date.now() });
  let courses: { id: string; name: string; distanceMeters: number | null }[] = [];
  if (chosen) {
    try {
      courses = await getCourseDataClient().nearbyCourses(chosen);
    } catch {
      courses = [];
    }
  }
  const plan = planNearbyCourses({
    phoneFix,
    courses,
    nowMs: ctx.nowMs?.() ?? Date.now(),
  });
  const msg = nearbyCoursesPayload(plan);
  await pushNearbyJson(msg);
  return msg;
}

export async function handleWatchNearbyJson(json: string): Promise<{ ok: boolean; feedback: string }> {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, feedback: PHONE_UNAVAILABLE };
  }
  const ctx = context;
  if (!ctx) return { ok: false, feedback: PHONE_UNAVAILABLE };

  if (parseNearbyRequest(raw)) {
    await pushWatchNearbyCourses({ allowDuringRound: true });
    return { ok: true, feedback: ctx.hasActiveRound() ? 'Round in progress' : 'Courses' };
  }

  const pick = parseNearbyCoursePick(raw);
  if (pick) {
    if (ctx.hasActiveRound() && !replaceLiveRoundAllowed) {
      return { ok: true, feedback: 'Round in progress' };
    }
    try {
      const detail = await getCourseDataClient().getCourse(pick.courseId);
      if (!detail) {
        const plan = planNearbyCourses({ phoneFix: null, courses: [], nowMs: Date.now() });
        await pushNearbyJson(nearbyCoursesPayload(plan));
        return { ok: false, feedback: 'open the phone' };
      }
      coursePickedHandler?.({ course: summaryFromDetail(detail), detail });
      if (detail.tees.length === 0) {
        const holeCount = roundHoleCountFromCourse(detail.holeCount, 18);
        const layout = layoutFromTee(detail, null);
        const round = startRound(ctx.db, holeCount, detail.name, layout);
        ctx.bump();
        router.push(`/round/${round.id}/hole/1`);
        return { ok: true, feedback: `Started · ${detail.name}` };
      }
      await pushNearbyJson(
        nearbyTeesPayload({
          courseId: detail.id,
          courseName: detail.name,
          tees: detail.tees,
        }),
      );
      return { ok: true, feedback: detail.name };
    } catch {
      return { ok: false, feedback: PHONE_UNAVAILABLE };
    }
  }

  const start = parseStartRound(raw);
  if (start) {
    if (ctx.hasActiveRound() && !replaceLiveRoundAllowed) {
      return { ok: true, feedback: 'Round in progress' };
    }
    try {
      const detail = await getCourseDataClient().getCourse(start.courseId);
      if (!detail) return { ok: false, feedback: 'open the phone' };
      const tee = detail.tees.find((row) => row.name === start.teeName) ?? null;
      if (!tee) return { ok: false, feedback: 'open the phone' };
      const holeCount = roundHoleCountFromCourse(detail.holeCount, 18);
      const layout = layoutFromTee(detail, tee);
      const round = startRound(ctx.db, holeCount, detail.name, layout);
      ctx.bump();
      router.push(`/round/${round.id}/hole/1`);
      return { ok: true, feedback: `${detail.name} · ${tee.name}` };
    } catch {
      return { ok: false, feedback: PHONE_UNAVAILABLE };
    }
  }

  return { ok: false, feedback: PHONE_UNAVAILABLE };
}

export function isWatchNearbyJson(json: string): boolean {
  try {
    const raw = JSON.parse(json) as { type?: string };
    return (
      raw?.type === 'nearbyRequest' ||
      raw?.type === 'nearbyCoursePick' ||
      raw?.type === 'startRound'
    );
  } catch {
    return false;
  }
}
