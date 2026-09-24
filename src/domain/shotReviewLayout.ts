import { HOLE_MAP_MIN_PAINT_PX } from './mapPaint';

/**
 * Shot review layout. The header, course name, hole chips, and par line stay
 * put. The map is the only flexible region. The shot list and Previous / Next
 * sit under it, so they rest at the bottom of the screen. A long list scrolls
 * inside a cap instead of crushing the map.
 * No yardage, GPS, or shot-data rules live here.
 */

/** Floor for the map slot. Above the paint threshold so a short phone still frames. */
export const SHOT_REVIEW_MAP_MIN_HEIGHT = 160;

/**
 * Visible shot-line window before the list scrolls.
 * Four lines of the review type size, with the same gap the screen already uses.
 */
export const SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT = 120;

export function shotReviewMapMeetsPaintFloor(): boolean {
  return SHOT_REVIEW_MAP_MIN_HEIGHT >= HOLE_MAP_MIN_PAINT_PX;
}

/**
 * Short lists shrink-wrap so the lines sit on the buttons.
 * Longer lists use the cap and scroll. Zero or junk measurements stay at 0
 * until the list reports a real content height.
 */
export function shotReviewShotListWindow(contentHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  return Math.min(contentHeight, SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
}
