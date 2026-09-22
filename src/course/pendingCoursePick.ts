import type { CourseDetail, CourseSummary, TeeSet } from './types';

export type PendingCoursePick = {
  course: CourseSummary;
  detail: CourseDetail | null;
  tee: TeeSet | null;
};

let pending: PendingCoursePick | null = null;

export function setPendingCoursePick(pick: PendingCoursePick | null): void {
  pending = pick;
}

export function takePendingCoursePick(): PendingCoursePick | null {
  const next = pending;
  pending = null;
  return next;
}
