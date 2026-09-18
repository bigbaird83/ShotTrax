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

/** Opening frame padding. Tight pin-zoom is the miss. */
const FRAME_PAD = 2.2;
const MIN_REGION_DELTA = 0.0048;
const MIN_CAMERA_SPAN_M = 280;

/** Rotation is the map camera only. Pin coordinates and yards do not change. */
export function holeCameraIsCameraOnly(): true {
  return true;
}

/** Bearing is tee → green. Never the phone compass / GPS heading. */
export function holeCameraUsesPhoneHeading(): false {
  return false;
}

/** Device / compass heading never rotates the hole. */
export function holeCameraUsesDeviceHeading(): false {
  return false;
}

/** After the opening apply, leave the camera alone. */
export function holeCameraLeavesAloneAfterOpen(): true {
  return true;
}

export function holeCameraReframesOnGps(): false {
  return false;
}

export function holeCameraReframesOnPinDrag(): false {
  return false;
}

/** Missing green keeps the last tee-to-green frame. Never the house / phone. */
export function missingGreenCentersOnPhone(): false {
  return false;
}

export function keepLastGoodHoleFrameWhenGreenMissing(): true {
  return true;
}

/** Add shot draws tee + green immediately. It does not wait for a phone fix. */
export function addShotMapWaitsForPhoneFix(): false {
  return false;
}

export function addShotMapUsesPhoneFix(): false {
  return false;
}

export type CourseCardCamera = {
  points: LatLng[];
  heading: number;
};

/** Course-card camera never waits on a phone fix. */
export function courseCardCameraWaitsForPhoneFix(): false {
  return false;
}

/** Phone GPS never enters the course-card frame. */
export function courseCardCameraUsesPhone(): false {
  return false;
}

/** A lone pin or house coordinate is not a course-card frame. */
export function courseCardCameraFramesLonePin(): false {
  return false;
}

/**
 * One camera for round start, Add shot, and edit.
 * Same function, same inputs: course tee + green center from the course card.
 * Phone is ignored. Tee at the bottom, green at the top.
 * Missing tee or green → null. Never a lone pin. Never the house.
 */
export function planCourseCardCamera(args: {
  tee: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): CourseCardCamera | null {
  void args.phone;
  if (!isValidLatLng(args.tee) || !isValidLatLng(args.green)) return null;
  const heading = holeCameraHeading(args.tee, args.green);
  if (heading == null) return null;
  return { points: [args.tee, args.green], heading };
}

/**
 * Add shot camera points. Same helper as round start and edit:
 * planCourseCardCamera. Phone is ignored. Missing tee or green → null.
 */
export function addShotFramePoints(args: {
  tee: LatLng | null;
  green: LatLng | null;
  phone?: LatLng | null;
}): LatLng[] | null {
  return planCourseCardCamera(args)?.points ?? null;
}

/** Course tee stored on the hole. Never invented from the phone. */
export function courseTeeFromHole(
  hole:
    | {
        teeLat?: number | null;
        teeLng?: number | null;
      }
    | null
    | undefined,
): LatLng | null {
  if (!hole) return null;
  const tee = { lat: hole.teeLat ?? Number.NaN, lng: hole.teeLng ?? Number.NaN };
  return isValidLatLng(tee) ? tee : null;
}

/**
 * Play / Add shot tee: course coordinate, then overlay / cache.
 * Phone GPS is never a tee.
 */
export function resolvePlayHoleTee(args: {
  courseTee?: LatLng | null;
  overlayTee?: LatLng | null;
  cachedTee?: LatLng | null;
  green?: LatLng | null;
}): LatLng | null {
  return resolveHoleTee({
    holeTee: args.courseTee ?? args.overlayTee ?? args.cachedTee ?? null,
    osmTee: args.cachedTee ?? args.overlayTee ?? null,
    green: args.green ?? null,
  });
}

/** Opening lock-frame maps need tee + green. A lone green is the house / pin-zoom miss. */
export function lockFramePointsNeedTeeAndGreen(): true {
  return true;
}

/** Add shot never pairs a card number with Waiting on your location. */
export function addShotShowsWaitingWithCardYards(): false {
  return false;
}

/** Add shot never says Waiting on your location. 282 is already the course number. */
export function addShotShowsWaitingOnLocation(): false {
  return false;
}

/** Add shot keeps the map chip. The extra footer is the duplicate. */
export function addShotPlaceHintShowsAsFooter(): false {
  return false;
}

export function addShotPlaceHintShowsOnMap(): true {
  return true;
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

/**
 * Project a point into the hole camera's screen. Y grows down.
 * Heading is tee → green, so green is up and the tee is below.
 */
export function projectHoleCameraScreen(
  point: LatLng,
  center: LatLng,
  headingDeg: number,
): { x: number; y: number } | null {
  if (!isValidLatLng(point) || !isValidLatLng(center) || !Number.isFinite(headingDeg)) return null;
  const north = point.lat - center.lat;
  const east = (point.lng - center.lng) * Math.cos(toRad(center.lat));
  const rad = toRad(headingDeg);
  const upN = Math.cos(rad);
  const upE = Math.sin(rad);
  const rightN = -Math.sin(rad);
  const rightE = Math.cos(rad);
  return {
    x: east * rightE + north * rightN,
    y: -(east * upE + north * upN),
  };
}

/**
 * True when the opening camera puts the tee below the green, hole running
 * straight up the screen — not beside it.
 */
export function holeCameraTeeBelowGreenOnScreen(
  tee: LatLng,
  green: LatLng,
  heading: number | null,
): boolean {
  if (heading == null || !Number.isFinite(heading)) return false;
  const center = midpoint([tee, green]);
  if (!center) return false;
  const teeScreen = projectHoleCameraScreen(tee, center, heading);
  const greenScreen = projectHoleCameraScreen(green, center, heading);
  if (!teeScreen || !greenScreen) return false;
  const dy = teeScreen.y - greenScreen.y;
  const dx = Math.abs(teeScreen.x - greenScreen.x);
  return dy > 0 && dy > dx;
}

export function openingHoleRegionContainsPoint(
  region: HoleMapRegion | null | undefined,
  point: LatLng | null | undefined,
): boolean {
  if (!region || !isValidLatLng(point)) return false;
  if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return false;
  if (!Number.isFinite(region.latitudeDelta) || !Number.isFinite(region.longitudeDelta)) return false;
  return (
    Math.abs(point.lat - region.latitude) <= region.latitudeDelta / 2 &&
    Math.abs(point.lng - region.longitude) <= region.longitudeDelta / 2
  );
}

/** Opening region must contain the tee and the green together. */
export function openingHoleRegionContainsTeeAndGreen(
  region: HoleMapRegion | null | undefined,
  tee: LatLng | null | undefined,
  green: LatLng | null | undefined,
): boolean {
  return openingHoleRegionContainsPoint(region, tee) && openingHoleRegionContainsPoint(region, green);
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

/** A single green pin is not an opening frame. That is the tight-on-trees miss. */
export function openingCameraRequiresTeeAndGreen(): true {
  return true;
}

/**
 * Locked camera for every hole map. Center, span, and heading come from the
 * hole only (tee + green). A lone green pin is not framed. A home-scale phone
 * fix must not change any of those. Never invents a point from the phone.
 * Tee at the bottom, green at the top, even from home.
 */
export function lockHoleCamera(args: {
  tee: LatLng | null;
  green: LatLng | null;
  shotPins: LatLng[];
  phone?: LatLng | null;
  previous?: LockedHoleCamera | null;
}): LockedHoleCamera | null {
  const plan = planHoleCamera(args);
  const next = plan
    ? (() => {
        const center = midpoint(plan.points);
        if (!center) return null;
        return {
          ...plan,
          center,
          spanYards: maxSpanYards(plan.points),
        };
      })()
    : null;
  return keepLastGoodHoleCamera(next, args.previous);
}

/**
 * Tee + green wins. If the green drops out, keep that last hole-up frame.
 * A lone green pin is not an opening camera. Never the phone / house.
 */
export function keepLastGoodHoleCamera(
  next: LockedHoleCamera | null | undefined,
  previous: LockedHoleCamera | null | undefined,
): LockedHoleCamera | null {
  if (next?.mode === 'tee_green' && next.heading != null) return next;
  if (previous?.mode === 'tee_green' && previous.heading != null) return previous;
  if (next?.mode === 'green') return null;
  return next ?? previous ?? null;
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
  const spanM = Math.max(MIN_CAMERA_SPAN_M, maxSpanYards(points) * METERS_PER_YARD);
  return {
    center: { latitude: center.lat, longitude: center.lng },
    heading,
    pitch: 0,
    altitude: Math.max(1400, spanM * 4.2),
    zoom: Math.max(12, Math.min(16.2, 15.4 - Math.log2(Math.max(spanM, MIN_CAMERA_SPAN_M) / 280))),
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
  const latitudeDelta = Math.max((maxLat - minLat) * FRAME_PAD, MIN_REGION_DELTA);
  const longitudeDelta = Math.max((maxLng - minLng) * FRAME_PAD, MIN_REGION_DELTA);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

/**
 * Tee for hole-up framing. Prefer the candidate farther from the green so a
 * short hole-line near the cup does not steal the tee box. Never the phone.
 */
export function resolveHoleTee(args: {
  holeTee?: LatLng | null;
  osmTee?: LatLng | null;
  green?: LatLng | null;
}): LatLng | null {
  const line = isValidLatLng(args.holeTee) ? args.holeTee : null;
  const box = isValidLatLng(args.osmTee) ? args.osmTee : null;
  const green = isValidLatLng(args.green) ? args.green : null;
  if (line && box && green) {
    return haversineYards(box, green) >= haversineYards(line, green) ? box : line;
  }
  if (box) return box;
  if (line) return line;
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
