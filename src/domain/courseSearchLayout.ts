/**
 * Course search must not call -[RCTUIManager setNeedsLayout] on the main thread.
 * That call during a text-field or modal layout pass is the TF 71 crash
 * (Thunderbird / Magnolia). Result rows commit on a later turn.
 * Search does not invent tee or green paint.
 */

export const CRASH_PRONE_SEARCH_QUERIES = ['Thunderbird', 'Magnolia'] as const;

export function courseSearchUsesMainThreadSetNeedsLayout(): false {
  return false;
}

/** Home does not open search by typing the first letter into a text field. */
export function courseSearchOpensFromFirstLetter(): false {
  return false;
}

/** Search pill navigates to the search screen on tap. */
export function courseSearchOpensOnPillTap(): true {
  return true;
}

export function courseSearchInventsPaint(): false {
  return false;
}

export function courseSearchRendersMap(): false {
  return false;
}

export type SearchFrameTask = () => void;

/** Runs `apply` on a later turn. The current call returns before any layout commit. */
export function deferCourseSearchLayout(
  apply: SearchFrameTask,
  schedule: (task: SearchFrameTask) => void = queueMicrotask,
): void {
  schedule(apply);
}
