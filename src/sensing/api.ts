import type { GpsFix } from '../domain/types';
import { getCurrentFix } from '../services/location';

export { acceptFix, forceMark } from './gates';
export type { AcceptFixResult, ForceMarkResult, LatLng } from './gates';
export { yardsToGreen } from './yardsToGreen';
export type { YardsToGreenResult } from './yardsToGreen';

/** GPS at club pick / next mark. Never invents a coordinate. */
export async function getFix(): Promise<GpsFix> {
  return getCurrentFix();
}
