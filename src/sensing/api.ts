import type { GpsFix } from '../domain/types';
import { getCurrentFix } from '../services/location';

export { acceptFix, forceMark } from './gates';
export type { AcceptFixResult, ForceMarkResult, LatLng } from './gates';

/** GPS at club confirm / next mark. Never invents a coordinate. */
export async function getFix(): Promise<GpsFix> {
  return getCurrentFix();
}
