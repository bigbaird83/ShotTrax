import { isValidLatLng, type LatLng } from './latLng';

export type CatchUpFrameMode = 'tee_green' | 'shots' | 'green';

export type CatchUpFrame = {
  mode: CatchUpFrameMode;
  points: LatLng[];
};

/**
 * Frame the catch-up add-shot map.
 * Tee + green → fit the hole. Missing tee or green → existing shot pins.
 * No pins → green. Never includes the phone GPS fix.
 */
export function planCatchUpFrame(args: {
  tee: LatLng | null;
  green: LatLng | null;
  shotPins: LatLng[];
}): CatchUpFrame | null {
  const tee = isValidLatLng(args.tee) ? args.tee : null;
  const green = isValidLatLng(args.green) ? args.green : null;
  const pins = args.shotPins.filter((pin) => isValidLatLng(pin));
  if (tee && green) return { mode: 'tee_green', points: [tee, green] };
  if (pins.length > 0) return { mode: 'shots', points: pins };
  if (green) return { mode: 'green', points: [green] };
  return null;
}

/** User dot may stay on screen; it never seeds a from/to pin. */
export function catchUpPinSeedsFromUserFix(): false {
  return false;
}

/** Catch-up pins are the tap coordinate, never the phone's current GPS fix. */
export function catchUpPinFromTap(coord: LatLng, _userFix?: { lat: number; lng: number } | null): LatLng | null {
  if (!isValidLatLng(coord)) return null;
  return { lat: coord.lat, lng: coord.lng };
}

export function catchUpFrameIncludesUserFix(): false {
  return false;
}

export function featureCentroid(coordinates: LatLng[]): LatLng | null {
  const valid = coordinates.filter((point) => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
  const lng = valid.reduce((sum, point) => sum + point.lng, 0) / valid.length;
  const point = { lat, lng };
  return isValidLatLng(point) ? point : null;
}
