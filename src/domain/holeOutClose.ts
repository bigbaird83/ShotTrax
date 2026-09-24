import { haversineYards, roundYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';
import type { FixQuality } from './types';

/**
 * Hole Out seal for the club-pick shot that is still open.
 * Start is the mark already stored on that shot. End is a pin/green the
 * hole already has. Yards are haversine between those two points.
 * Missing pin or mark → no plan. Never invents a coordinate.
 */
export type HoleOutPinClose = {
  shotId: string;
  endLat: number;
  endLng: number;
  endAccuracyM: null;
  /** Pin is not a GPS sample — no end accuracy is written. */
  endFixQuality: null;
  distanceYards: number;
  impossibleJump: false;
  /** Quality already stored on the mark. Not a new fix. */
  fixQuality: FixQuality | null;
};

export function planHoleOutCloseToPin(args: {
  shotId: string;
  start: LatLng | null | undefined;
  startFixQuality: FixQuality | null;
  pin: LatLng | null | undefined;
}): HoleOutPinClose | null {
  if (!args.shotId) return null;
  if (!isValidLatLng(args.start) || !isValidLatLng(args.pin)) return null;
  const yards = roundYards(haversineYards(args.start, args.pin));
  if (!Number.isFinite(yards) || yards < 0) return null;
  return {
    shotId: args.shotId,
    endLat: args.pin.lat,
    endLng: args.pin.lng,
    endAccuracyM: null,
    endFixQuality: null,
    distanceYards: yards,
    impossibleJump: false,
    fixQuality: args.startFixQuality,
  };
}
