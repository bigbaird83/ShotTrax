import { finishShotChip } from './playerCopy';

/** Next hole is always allowed. Nothing invented for unfinished shots or putts. */

export function canAdvanceHole(args: { holeNumber: number; holeCount: number }): boolean {
  if (!Number.isFinite(args.holeNumber) || !Number.isFinite(args.holeCount)) return false;
  return args.holeNumber < args.holeCount;
}

/** Unfinished does not block Next — play continues; a chip flags the hole. */
export function nextBlockedByUnfinished(_unfinished: boolean): false {
  return false;
}

export function finishShotChipLabel(holeNumber: number): string {
  return finishShotChip(holeNumber);
}

export function holesNeedingOpenShots(
  holes: { number: number; hasOpenShot: boolean }[],
  currentHoleNumber: number,
): { number: number; hasOpenShot: boolean }[] {
  return holes.filter((hole) => hole.hasOpenShot && hole.number !== currentHoleNumber);
}
