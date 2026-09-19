import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import { holeAfterDone } from './putts';

/** Chip-in / hole-out from off the green. Never invents a putt or a green. */

export const HOLED_OUT_CHIP = 'Holed out';

export function finishHoleLabel(): 'Finish hole' {
  return 'Finish hole';
}

export function holedOutChip(): typeof HOLED_OUT_CHIP {
  return HOLED_OUT_CHIP;
}

export function finishHoleInventPutts(): false {
  return false;
}

export function finishHoleInventPuttYards(): false {
  return false;
}

export function finishHoleInventGreen(): false {
  return false;
}

export function finishHoleCelebrationIsModal(): false {
  return false;
}

export function finishHoleUsesConfetti(): false {
  return false;
}

/** One beat: lime check + short haptic + quiet chip. */
export function finishHoleCelebrationBeats(): 1 {
  return 1;
}

/**
 * Putting-surface check from a real green only.
 * Depth from the API is a real extent. A lone centroid cannot invent a green.
 */
export function finishHoleOnGreen(args: {
  lastMark?: LatLng | null;
  green?: LatLng | null;
  greenDepthYards?: number | null;
}): boolean {
  if (!isValidLatLng(args.lastMark) || !isValidLatLng(args.green)) return false;
  const depth = args.greenDepthYards;
  if (depth == null || !Number.isFinite(depth) || depth <= 0) return false;
  const radius = depth / 2;
  return haversineYards(args.lastMark, args.green) <= radius;
}

/**
 * GIR needs the putting surface in regulation. Off-green hole-out is not a GIR.
 * Missing green → not on the green → not a GIR. Never invent the green.
 */
export function planFinishHoleGir(args: {
  onGreen: boolean | null;
  par?: number | null;
  shotCount?: number | null;
}): boolean {
  if (args.onGreen !== true) return false;
  const par = args.par;
  const shots = args.shotCount;
  if (par == null || !Number.isFinite(par) || par < 3) return false;
  if (shots == null || !Number.isFinite(shots) || shots < 1) return false;
  return shots <= par - 2;
}

export function finishHolePinToPinYards(from: LatLng | null | undefined, to: LatLng | null | undefined): number | null {
  if (!isValidLatLng(from) || !isValidLatLng(to)) return null;
  return roundYards(haversineYards(from, to));
}

export type FinishHolePlan = {
  putts: 0;
  puttLengths: [];
  puttsDone: true;
  gir: boolean;
  inventPutt: false;
  dest: ReturnType<typeof holeAfterDone>;
};

export function planFinishHole(args: {
  onGreen: boolean | null;
  par?: number | null;
  shotCount?: number | null;
  holeNumber: number;
  holeCount: number;
}): FinishHolePlan {
  return {
    putts: 0,
    puttLengths: [],
    puttsDone: true,
    gir: planFinishHoleGir({
      onGreen: args.onGreen,
      par: args.par,
      shotCount: args.shotCount,
    }),
    inventPutt: false,
    dest: holeAfterDone(args.holeNumber, args.holeCount),
  };
}
