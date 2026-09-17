import { yardsToGreen, type YardsToGreenResult } from '../sensing/yardsToGreen';
import { isValidLatLng, type LatLng } from './latLng';
import type { GpsFix } from './types';

/** Front / middle / back pins from course data only. Missing stays null — never invented. */
export type GreenDepthPins = {
  front: LatLng | null;
  middle: LatLng | null;
  back: LatLng | null;
  /** API-provided green depth in yards. Null if omitted — never derived. */
  depthYards: number | null;
};

export type GreenDepthYards = {
  front: YardsToGreenResult | null;
  middle: YardsToGreenResult | null;
  back: YardsToGreenResult | null;
};

export function emptyGreenDepth(): GreenDepthPins {
  return { front: null, middle: null, back: null, depthYards: null };
}

export function pinOrNull(point: LatLng | null | undefined): LatLng | null {
  return isValidLatLng(point) ? point : null;
}

/**
 * F/M/B row is shown only when the API supplied front and back (and a middle/centroid).
 * A single centroid is never expanded into fake F/B.
 */
export function hasApiFmb(pins: GreenDepthPins): boolean {
  return Boolean(pinOrNull(pins.front) && pinOrNull(pins.middle) && pinOrNull(pins.back));
}

export function yardsToGreenDepth(fix: GpsFix | null, pins: GreenDepthPins): GreenDepthYards {
  return {
    front: pins.front ? yardsToGreen(fix, pins.front) : null,
    middle: pins.middle ? yardsToGreen(fix, pins.middle) : null,
    back: pins.back ? yardsToGreen(fix, pins.back) : null,
  };
}

export function formatFmbRow(yards: GreenDepthYards): { f: string; m: string; b: string } | null {
  const f = yards.front;
  const m = yards.middle;
  const b = yards.back;
  if (!f || !m || !b) return null;
  const cell = (row: YardsToGreenResult) =>
    row.quality !== 'none' && row.yards != null ? String(row.yards) : '—';
  return { f: cell(f), m: cell(m), b: cell(b) };
}
