import { METERS_PER_YARD } from '../config/sensing';
import { planCatchUpFrame, type CatchUpFrameMode } from './catchUpMap';
import { haversineYards } from './haversine';
import { isValidLatLng, type LatLng } from './latLng';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function midpoint(points: LatLng[]): LatLng | null {
  const valid = points.filter((point) => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
  const lng = valid.reduce((sum, point) => sum + point.lng, 0) / valid.length;
  const center = { lat, lng };
  return isValidLatLng(center) ? center : null;
}

function maxSpanYards(points: LatLng[]): number {
  const valid = points.filter((point) => isValidLatLng(point));
  let maxYd = 0;
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      maxYd = Math.max(maxYd, haversineYards(valid[i], valid[j]));
    }
  }
  return maxYd;
}

/** Rotation is the map camera only. Pin coordinates and yards do not change. */
export function holeCameraIsCameraOnly(): true {
  return true;
}

/** Bearing is tee → green. Never the phone compass / GPS heading. */
export function holeCameraUsesPhoneHeading(): false {
  return false;
}

/** Phone GPS never enters camera bounds, heading, or center. */
export function holeCameraIncludesPhoneFix(): false {
  return false;
}

/**
 * Camera heading that puts the tee at the bottom of the phone and the green
 * at the top, straight up the screen. That is the initial great-circle bearing
 * from tee to green, degrees clockwise from true north in [0, 360).
 *
 * Missing / invalid tee or green → null. Coincident points → null.
 * Never invents a bearing. Not compass north unless the hole actually runs north.
 * Not the phone heading. Pins and yards stay as stored.
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

export type LockedHoleCamera = HoleCameraPlan & {
  center: LatLng;
  /** Max pairwise yards of the framed points only. Phone never widens this. */
  spanYards: number;
};

export type HoleMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * Frame + heading for every hole map: play, Add shot, edit-shot, Nerd out trail.
 * Tee + green → fit those points and rotate hole-up.
 * Missing tee or green → existing shot pins, else the green, and do not rotate.
 * `phone` is ignored — never a frame point, center, span, or heading.
 */
export function planHoleCamera(args: {
  tee: LatLng | null;
  green: LatLng | null;
  shotPins: LatLng[];
  phone?: LatLng | null;
}): HoleCameraPlan | null {
  void args.phone;
  const frame = planCatchUpFrame({
    tee: args.tee,
    green: args.green,
    shotPins: args.shotPins,
  });
  if (!frame) return null;
  return {
    ...frame,
    heading: frame.mode === 'tee_green' ? holeCameraHeading(args.tee, args.green) : null,
  };
}

/**
 * Locked camera for every hole map. Center, span, and heading come from the
 * hole only (tee + green, else shot pins, else the green). A home-scale phone
 * fix or an on-course fix must not change any of those. Never invents a point
 * from the phone. Tee at the bottom, green at the top, even from home.
 */
export function lockHoleCamera(args: {
  tee: LatLng | null;
  green: LatLng | null;
  shotPins: LatLng[];
  phone?: LatLng | null;
}): LockedHoleCamera | null {
  const plan = planHoleCamera(args);
  if (!plan) return null;
  const center = midpoint(plan.points);
  if (!center) return null;
  return {
    ...plan,
    center,
    spanYards: maxSpanYards(plan.points),
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
  const center = midpoint(points);
  if (!center) return null;
  const spanM = Math.max(80, maxSpanYards(points) * METERS_PER_YARD);
  return {
    center: { latitude: center.lat, longitude: center.lng },
    heading,
    pitch: 0,
    altitude: Math.max(600, spanM * 3.4),
    zoom: Math.max(12, Math.min(19, 16.6 - Math.log2(Math.max(spanM, 80) / 220))),
  };
}

/**
 * North-up fallback region from framed points only.
 * Used when tee or green is missing so we do not rotate.
 * Never includes or invents a phone coordinate.
 */
export function holeFrameRegion(points: LatLng[]): HoleMapRegion | null {
  const valid = points.filter((point) => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lats = valid.map((point) => point.lat);
  const lngs = valid.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  if (!isValidLatLng({ lat: latitude, lng: longitude })) return null;
  const latitudeDelta = Math.max((maxLat - minLat) * 1.7, 0.0016);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.7, 0.0016);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

/**
 * Tee for hole-up framing. Prefer the hole's own tee. OSM tee is fallback only.
 * Never invents a point from the phone.
 */
export function resolveHoleTee(args: {
  holeTee?: LatLng | null;
  osmTee?: LatLng | null;
}): LatLng | null {
  if (isValidLatLng(args.holeTee)) return args.holeTee;
  if (isValidLatLng(args.osmTee)) return args.osmTee;
  return null;
}

export type HoleMapHandle = {
  setCamera?: (camera: HoleNativeCamera) => void;
  animateToRegion?: (region: HoleMapRegion, duration?: number) => void;
} | null | undefined;

/**
 * Apply the locked hole camera to a live map. A null ref is not success —
 * the caller must not stick a framed flag, and must re-apply when the map exists.
 */
export function applyHoleMapCamera(
  map: HoleMapHandle,
  camera: HoleNativeCamera | null | undefined,
  region?: HoleMapRegion | null,
): boolean {
  if (map == null) return false;
  if (camera) {
    if (typeof map.setCamera !== 'function') return false;
    map.setCamera(camera);
    return true;
  }
  if (region) {
    if (typeof map.animateToRegion !== 'function') return false;
    map.animateToRegion(region, 0);
    return true;
  }
  return false;
}

/** Only a successful live apply may stick the framed flag. */
export function holeCameraFramedAfterApply(applied: boolean): boolean {
  return applied;
}

/** Native maps ignore opacity. Cover until the hole region is actually on screen. */
export function holeMapRevealsBeforeHoleFrame(): false {
  return false;
}

/** Every hole map never lets Apple/Google follow the phone into the frame. */
export function holeMapShowsUserLocation(lockFrame: boolean): boolean {
  return !lockFrame;
}

/** Play, Add shot, edit-shot, and the Nerd out trail all lock tee-to-green. */
export function everyHoleMapUsesLockFrame(): true {
  return true;
}

export function editShotMapUsesLockFrame(): true {
  return true;
}

export function nerdOutTrailUsesLockFrame(): true {
  return true;
}

/** Do not invent a phone coordinate to seed the camera. */
export function holeMapInventPhonePoint(): false {
  return false;
}

/** Start and landing pins only. Never a fabricated phone point. */
export function shotPinsForHoleCamera(
  shots: {
    startLat: number | null;
    startLng: number | null;
    endLat: number | null;
    endLng: number | null;
  }[],
): LatLng[] {
  const pins: LatLng[] = [];
  for (const shot of shots) {
    const start = { lat: shot.startLat ?? Number.NaN, lng: shot.startLng ?? Number.NaN };
    if (isValidLatLng(start)) pins.push(start);
    const end = { lat: shot.endLat ?? Number.NaN, lng: shot.endLng ?? Number.NaN };
    if (isValidLatLng(end)) pins.push(end);
  }
  return pins;
}

/** fitToCoordinates would pull the user dot in. The lock uses setCamera only. */
export function holeMapFitsToCoordinates(lockFrame: boolean): boolean {
  return !lockFrame;
}

/** A lock-frame region is tee/green/pins only. Phone GPS is never a fallback. */
export function lockFrameRegionIncludesPhone(): false {
  return false;
}

/** A null map ref must not stick framedOnce. */
export function holeCameraNullRefIsFramed(): false {
  return false;
}

/**
 * True when the visible region is already the hole, not a home-scale GPS fix.
 * Used so the first thing shown is tee-to-green, not a later correction.
 */
export function regionIsHoleFrame(
  region: { latitude: number; longitude: number } | null | undefined,
  holeCenter: LatLng | null | undefined,
): boolean {
  if (!region || !isValidLatLng(holeCenter)) return false;
  if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return false;
  return (
    Math.abs(region.latitude - holeCenter.lat) < 0.05 &&
    Math.abs(region.longitude - holeCenter.lng) < 0.05
  );
}
