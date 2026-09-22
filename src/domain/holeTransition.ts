/**
 * Previous hole slides in from the left. Next hole slides in from the right.
 * Direction is armed before navigation and consumed by the hole screen.
 */

export type HoleNavDirection = 'previous' | 'next';

export type HoleSlideAnimation = 'slide_from_left' | 'slide_from_right';

export const HOLE_SLIDE_MS = 280;

export function holeNavDirection(fromHole: number, toHole: number): HoleNavDirection {
  return toHole < fromHole ? 'previous' : 'next';
}

export function holeSlideAnimation(direction: HoleNavDirection): HoleSlideAnimation {
  return direction === 'previous' ? 'slide_from_left' : 'slide_from_right';
}

/** Incoming screen starts off this side of the window, then travels to 0. */
export function holeSlideStartsOffscreenX(direction: HoleNavDirection, width: number): number {
  const span = Math.abs(width);
  return holeSlideAnimation(direction) === 'slide_from_left' ? -span : span;
}

let pending: HoleNavDirection | null = null;

export function armHoleTransition(direction: HoleNavDirection): void {
  pending = direction;
}

export function consumeHoleTransition(): HoleNavDirection | null {
  const next = pending;
  pending = null;
  return next;
}

export function resetHoleTransitionForTests(): void {
  pending = null;
}
