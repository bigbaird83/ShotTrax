import { METERS_PER_YARD } from '../config/sensing';
import { planCatchUpFrame, type CatchUpFrameMode } from './catchUpMap';
import { haversineYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Camera heading that puts the tee at the bottom of the phone and the green
 * at the top, straight up the screen. That is the initial great-circle bearing
 * from tee to green, degrees clockwise from true north in [0, 360).
 *
 * Missing / invalid tee or green → null. Coincident points → null.
 * Never invents a bearing. Not compass north unless the hole actually runs north.
 */
export function holeCameraHeading(
  tee: LatLng | null | undefined,
  green: LatLng | null | undefined,
): number | null {
  if (!isValidLatLng(tee) || !isValidLatLng(green)) return null;
  if (tee.lat === green.lat && tee.lng === green.lng) return null;

  const φ1 = toRad(tee.lat);
  const φ2 = toRad(green.lat);
  const Δλ = toRad(green.lng - tee.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  if (y === 0 && x === 0) return null;
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export type HoleCameraPlan = {
  mode: CatchUpFrameMode;
  points: LatLng[];
  /** Null means do not rotate — keep the north-up framing fallback. */
  heading: number | null;
};

/**
 * Frame + heading for the play map and the Add shot map.
 * Tee + green → fit those points and rotate hole-up.
 * Missing tee or green → existing shot pins, else the green, and do not rotate.
 */
export function planHoleCamera(args: {
  tee: LatLng | null;
  green: LatLng | null;
  shotPins: LatLng[];
}): HoleCameraPlan | null {
  const frame = planCatchUpFrame(args);
  if (!frame) return null;
  return {
    ...frame,
    heading: frame.mode === 'tee_green' ? holeCameraHeading(args.tee, args.green) : null,
  };
}

export type HoleNativeCamera = {
  center: { latitude: number; longitude: number };
  heading: number;
  pitch: 0;
  altitude: number;
  zoom: number;
};

/** Apple Maps altitude / Google zoom that fits the framed points after rotation. */
export function holeNativeCamera(points: LatLng[], heading: number): HoleNativeCamera | null {
  if (!Number.isFinite(heading)) return null;
  const valid = points.filter((point) => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
  const lng = valid.reduce((sum, point) => sum + point.lng, 0) / valid.length;
  const center = { lat, lng };
  if (!isValidLatLng(center)) return null;

  let maxYd = 0;
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      maxYd = Math.max(maxYd, haversineYards(valid[i], valid[j]));
    }
  }
  const spanM = Math.max(80, maxYd * METERS_PER_YARD);
  return {
    center: { latitude: center.lat, longitude: center.lng },
    heading,
    pitch: 0,
    altitude: Math.max(600, spanM * 3.4),
    zoom: Math.max(12, Math.min(19, 16.6 - Math.log2(Math.max(spanM, 80) / 220))),
  };
}
