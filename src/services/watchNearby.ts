import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCourseDataClient } from '@/src/course/client';
import type { CourseDetail, CourseSummary } from '@/src/course/types';
import { layoutFromTee } from '@/src/course/layout';
import { prefetchCourseCardInBackground, rememberLayoutHoles } from '@/src/course/prefetch';
import { startRound } from '@/src/db/repo';
import { playHrefAfterRoundStart } from '@/src/domain/playNav';
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
  const nowMs = ctx.nowMs?.() ?? Date.now();
  try {
    const woken = await getCurrentFix();
    if (phoneFixForNearbyCourses({ phoneFix: woken, nowMs: ctx.nowMs?.() ?? Date.now() })) {
      return woken;
    }
  } catch {
    // Permission off or no sample — last live phone fix only if it is still fresh.
  }
  const live = ctx.phoneFix() ?? getLastLiveFix();
  if (phoneFixForNearbyCourses({ phoneFix: live, nowMs })) return live;
  return null;
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
      const holeCount = start.holeCount === 9 ? 9 : 18;
      const tee = start.teeName
        ? detail.tees.find((row) => row.name === start.teeName) ?? null
        : null;
      if (start.teeName && !tee) return { ok: false, feedback: 'open the phone' };
      if (detail.tees.length > 0 && !tee) return { ok: false, feedback: 'open the phone' };
      const layout = layoutFromTee(detail, tee);
      rememberLayoutHoles(layout);
      const round = startRound(ctx.db, holeCount, detail.name, layout);
      ctx.bump();
      router.push(playHrefAfterRoundStart(round.id));
      prefetchCourseCardInBackground(layout);
      return { ok: true, feedback: tee ? `${detail.name} · ${tee.name}` : detail.name };
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
